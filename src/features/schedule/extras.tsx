// Extras for the student's own schedule: compare with someone, hide holds,
// workload, next school day, .ics export and print. Secondary actions live in
// ONE "Mere" menu so the toolbar stays calm.
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DropdownMenu } from 'radix-ui';
import { CalendarArrowDown, ChevronRight, Columns2, Ellipsis, Eye, EyeOff, Loader2, Printer, Search, Star, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtTime, relativeDay } from '@/lib/format';
import { PATHS } from '@/lib/lectio/paths';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { readAssignments } from '@/lib/lectio/readers/assignments.js';
import type { AssignmentsData } from '@/features/assignments/model';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cardIdOf, fold, schedulePath, searchEntries, useDirectory, type DirectoryEntry } from '@/features/people/directory';
import { favoritesFirst, favoritesOf, parsePersonParam, useFavorites, type Favorite, type FavoriteKind } from '@/features/people/favorites';
import { useProfile } from '@/features/people/person';
import type { Lesson } from './lessons';
import { useWeekLessons, fetchWeekRaw } from './week-lessons';
import { addDays, weekOf } from './week';
import { nextSchoolDay, type SchoolDay } from './free-time';
import { HIDDEN_HOLDS_KEY, splitHidden, toggleHold } from './hidden-holds';
import { workloadByDay } from './workload';
import { buildIcs, downloadText, type IcsDeadline } from './ics';
import { useLocalItem } from './stored';

const readA = readAssignments as (doc: Document) => AssignmentsData;

// ------------------------------------------------------------------ state hooks

export function useHiddenHolds() {
  const [hidden, setHidden] = useLocalItem<string[]>(HIDDEN_HOLDS_KEY, []);
  return {
    hidden,
    toggle: (hold: string) => setHidden((h) => toggleHold(h, hold)),
    show: (holds: string[] | 'all') => setHidden((h) => (holds === 'all' ? [] : h.filter((x) => !holds.includes(x)))),
  };
}

/** The person in ?med=kind:id and their lessons for the week containing `at`. */
export function useCompare(at: Date, enabled = true) {
  const [params, setParams] = useSearchParams();
  const person = enabled ? parsePersonParam(params.get('med')) : null;
  const base = person ? schedulePath(person.kind, person.id) : null;
  const week = useWeekLessons(base, at);
  const { list } = useFavorites();
  const school = useSchoolId();
  const client = useQueryClient();
  const known = person
    ? list.find((f) => f.kind === person.kind && f.id === person.id)?.name ||
      client.getQueryData<DirectoryEntry[]>(['lectio-directory', school, person.kind])?.find((e) => e.id === person.id)?.name
    : undefined;
  const profile = useProfile(person && !known ? cardIdOf(person.kind, person.id) : '');
  const name = known || profile.data?.name || (person?.kind === 'laerer' ? 'læreren' : 'eleven');
  const set = (p: { kind: FavoriteKind; id: string } | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (p) next.set('med', `${p.kind}:${p.id}`);
        else next.delete('med');
        return next;
      },
      { replace: true },
    );
  return { person, name, lessons: week.data, isPending: !!person && week.isPending, error: person ? week.error : null, set };
}

/** Elevtimer due per day, from the assignment list (shared cache with Opgaver). */
export function useAssignments(enabled: boolean) {
  const { data } = useLectioPage(enabled ? PATHS.assignments : null, readA);
  const items = data?.data.assignments;
  const load = useMemo(() => (items ? workloadByDay(items) : null), [items]);
  return { items, load };
}

/**
 * The next school day after today: from the shown week when it is the current
 * one, else the current week read separately; next week only when this one has
 * no more school days.
 */
export function useNextSchoolDay(pageLessons: Lesson[] | null, now: Date, hidden: string[], enabled: boolean): SchoolDay<Lesson> | null {
  const current = useWeekLessons(enabled && !pageLessons ? PATHS.schedule : null, now);
  const thisWeek = pageLessons ?? current.data ?? null;
  const fromThisWeek = thisWeek ? nextSchoolDay(splitHidden(thisWeek, hidden).shown, now) : null;
  const nextWeek = useWeekLessons(enabled && thisWeek && !fromThisWeek ? PATHS.schedule : null, addDays(now, 7));
  if (!enabled) return null;
  if (fromThisWeek) return fromThisWeek;
  return nextWeek.data ? nextSchoolDay(splitHidden(nextWeek.data, hidden).shown, now) : null;
}

/** "I morgen møder du 08:15 og har fri 15:30" */
export function meetText(day: SchoolDay<Lesson>, now: Date): string {
  const rel = relativeDay(day.date, now);
  return `${rel.charAt(0).toUpperCase()}${rel.slice(1)} møder du ${fmtTime(day.first.startDate)} og har fri ${fmtTime(day.last.endDate)}`;
}

// ------------------------------------------------------------------ export / print

export const EXPORT_WEEKS = 6;

const exerciseId = (href: string | null) => {
  try {
    return href ? new URL(href).searchParams.get('exerciseid') : null;
  } catch {
    return null;
  }
};

/** Deadlines still to hand in, for the .ics file. */
export function icsDeadlines(items: AssignmentsData['assignments'] | undefined, now: Date): IcsDeadline[] {
  return (items || []).flatMap((a) => {
    const id = exerciseId(a.href);
    if (!id || !a.deadline || a.statusKind === 'delivered' || a.deadline <= now) return [];
    return [{ id, title: a.title, hold: a.hold, deadline: a.deadline, deadlineText: a.deadlineText, href: a.href }];
  });
}

export function useIcsExport({ hidden, assignments }: { hidden: string[]; assignments: AssignmentsData['assignments'] | undefined }) {
  const client = useQueryClient();
  const school = useSchoolId();
  const [state, setState] = useState<{ busy: boolean; message: string; error: boolean }>({ busy: false, message: '', error: false });
  const run = async () => {
    setState({ busy: true, message: `Henter ${EXPORT_WEEKS} uger fra Lectio…`, error: false });
    const now = new Date();
    const dates = Array.from({ length: EXPORT_WEEKS }, (_, i) => addDays(now, 7 * i));
    const results = await Promise.allSettled(dates.map((at) => fetchWeekRaw(client, school, PATHS.schedule, at)));
    const read = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (!read.length) {
      const reason = (results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined)?.reason;
      setState({ busy: false, message: `Skemaet kunne ikke hentes${reason?.message ? `: ${reason.message}` : '.'}`, error: true });
      return;
    }
    const lessons = splitHidden(read.flat(), hidden).shown;
    const deadlines = icsDeadlines(assignments, now);
    if (!lessons.length && !deadlines.length) {
      setState({ busy: false, message: `Der er ingen moduler eller frister de næste ${EXPORT_WEEKS} uger, så der er intet at eksportere.`, error: false });
      return;
    }
    const first = weekOf(dates[0]).week;
    const last = weekOf(dates[dates.length - 1]).week;
    downloadText(buildIcs({ lessons, deadlines, now }), `lectio-skema-uge-${first}-${last}.ics`);
    const skipped = results.length - read.length;
    setState({
      busy: false,
      error: skipped > 0,
      message:
        `${lessons.length} moduler${deadlines.length ? ` og ${deadlines.length} afleveringsfrister` : ''} gemt som .ics. Åbn filen for at føje dem til din kalender.` +
        (skipped ? ` ${skipped} ${skipped === 1 ? 'uge' : 'uger'} kunne ikke hentes.` : ''),
    });
  };
  return { ...state, run, dismiss: () => setState({ busy: false, message: '', error: false }) };
}

// ------------------------------------------------------------------ menus

const item =
  'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 data-[state=open]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle';
const panel = 'z-50 min-w-[220px] max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto animate-pop rounded-xl border border-border bg-surface p-1 shadow-pop';
const label = 'px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium text-fg-subtle';

function Sub({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={item}>
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronRight />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent sideOffset={4} collisionPadding={8} className={panel}>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/** One checkable row per hold; keeps the menu open so several can be toggled. */
function HoldItems({ holds, hidden, onToggle }: { holds: string[]; hidden: string[]; onToggle: (hold: string) => void }) {
  return (
    <>
      {holds.map((h) => {
        const off = hidden.includes(h);
        return (
          <DropdownMenu.CheckboxItem
            key={h}
            checked={off}
            onSelect={(e) => {
              e.preventDefault();
              onToggle(h);
            }}
            className={cn(item, off && 'text-fg-muted')}
          >
            {off ? <EyeOff /> : <Eye />}
            <span className={cn('flex-1 truncate', off && 'line-through decoration-fg-subtle')}>{h}</span>
          </DropdownMenu.CheckboxItem>
        );
      })}
    </>
  );
}

export function ScheduleMenu({
  holds,
  hidden,
  onToggleHold,
  comparing,
  onCompare,
  onSearch,
  onExport,
  exporting,
}: {
  holds: string[];
  hidden: string[];
  onToggleHold: (hold: string) => void;
  comparing: boolean;
  onCompare: (p: { kind: FavoriteKind; id: string } | null) => void;
  onSearch: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const { list } = useFavorites();
  const favorites = favoritesOf(list);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mere" title="Mere">
          <Ellipsis />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={8} className={panel}>
          <Sub icon={<Columns2 />} title="Sammenlign med …">
            {favorites.length > 0 && <DropdownMenu.Label className={label}>Favoritter</DropdownMenu.Label>}
            {favorites.map((f) => (
              <DropdownMenu.Item key={`${f.kind}:${f.id}`} className={item} onSelect={() => onCompare(f)}>
                <Star className="fill-current !text-warning" />
                <span className="flex-1 truncate">{f.name}</span>
                {f.code && <span className="text-[12px] text-fg-subtle">{f.code}</span>}
              </DropdownMenu.Item>
            ))}
            {favorites.length > 0 && <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />}
            <DropdownMenu.Item className={item} onSelect={onSearch}>
              <Search /> Søg efter elev eller lærer…
            </DropdownMenu.Item>
            {comparing && (
              <DropdownMenu.Item className={item} onSelect={() => onCompare(null)}>
                <X /> Stop sammenligning
              </DropdownMenu.Item>
            )}
          </Sub>
          <Sub icon={<EyeOff />} title={hidden.length ? `Skjul hold (${hidden.length} skjult)` : 'Skjul hold'}>
            <DropdownMenu.Label className={cn(label, 'max-w-[240px]')}>Skjulte hold vises ikke i dit skema her. Kun på denne enhed.</DropdownMenu.Label>
            {holds.length ? <HoldItems holds={holds} hidden={hidden} onToggle={onToggleHold} /> : <p className="px-2.5 py-1.5 text-[13px] text-fg-muted">Ingen hold denne uge.</p>}
          </Sub>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          <DropdownMenu.Item className={item} disabled={exporting} onSelect={onExport}>
            {exporting ? <Loader2 className="animate-spin" /> : <CalendarArrowDown />} Eksportér til kalender (.ics)
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => setTimeout(() => window.print(), 50)}>
            <Printer /> Udskriv ugen
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** "3 skjult": always visible while something is hidden; opens the hidden holds to show them again. */
export function HiddenBadge({ count, hidden, onToggle, onShowAll }: { count: number; hidden: string[]; onToggle: (hold: string) => void; onShowAll: () => void }) {
  if (!hidden.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-[11.5px] font-medium text-fg-muted tabular-nums hover:bg-surface-2 hover:text-fg print:hidden [&_svg]:size-3"
          title="Moduler fra hold, du har skjult"
        >
          <EyeOff /> {count ? `${count} skjult` : `${hidden.length} hold skjult`}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} collisionPadding={8} className={panel}>
          <DropdownMenu.Label className={label}>Skjulte hold – klik for at vise igen</DropdownMenu.Label>
          <HoldItems holds={hidden} hidden={hidden} onToggle={onToggle} />
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          <DropdownMenu.Item className={item} onSelect={onShowAll}>
            <Eye /> Vis alle hold
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ------------------------------------------------------------------ compare picker

export function ComparePicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (f: Favorite) => void }) {
  const [query, setQuery] = useState('');
  const searching = open && fold(query).length >= 2;
  const students = useDirectory('elev', searching);
  const teachers = useDirectory('laerer', searching);
  const favorites = useFavorites();
  const loading = searching && (students.isPending || teachers.isPending) && !students.data && !teachers.data;
  const failed = searching && !!students.error && !!teachers.error;
  const results: Favorite[] = searching
    ? favoritesFirst(searchEntries([...(teachers.data || []), ...(students.data || [])], query), favorites.list)
        .slice(0, 40)
        .map((e) => ({ kind: e.kind as FavoriteKind, id: e.id, name: e.name, code: e.code }))
    : favoritesOf(favorites.list);
  const pick = (f: Favorite) => {
    onPick(f);
    onOpenChange(false);
    setQuery('');
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 animate-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop outline-none animate-pop"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <Dialog.Title className="text-[15px] font-semibold">Sammenlign skema med …</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Luk">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="relative border-b border-border p-3">
            <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg efter navn, klasse eller initialer…" aria-label="Søg efter elev eller lærer" className="pl-9" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!searching && !results.length && (
              <p className="px-3 py-6 text-center text-[13px] text-fg-muted">
                Skriv mindst to bogstaver. Personer, du stjernemarkerer under Elever og Lærere, står her fremover.
              </p>
            )}
            {!searching && results.length > 0 && <p className="px-2.5 pt-1 pb-1.5 text-[11.5px] font-medium text-fg-subtle">Favoritter</p>}
            {loading && (
              <p className="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-fg-muted">
                <Loader2 className="size-4 animate-spin" /> Henter elever og lærere…
              </p>
            )}
            {failed && <p className="px-3 py-6 text-center text-[13px] text-danger-soft-fg">Listen over elever og lærere kunne ikke hentes fra Lectio.</p>}
            {searching && !loading && !failed && !results.length && <p className="px-3 py-6 text-center text-[13px] text-fg-muted">Ingen matcher “{query}”.</p>}
            <ul>
              {results.map((f) => (
                <li key={`${f.kind}:${f.id}`}>
                  <button type="button" onClick={() => pick(f)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                    <Avatar name={f.name} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-fg">{f.name}</span>
                      <span className="block truncate text-[12px] text-fg-subtle">
                        {f.kind === 'elev' ? 'Elev' : 'Lærer'}
                        {f.code && ` · ${f.code}`}
                      </span>
                    </span>
                    {favorites.has(f.kind, f.id) && <Star className="size-3.5 shrink-0 fill-current text-warning" aria-label="Favorit" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
