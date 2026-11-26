import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Clock, DoorOpen, ExternalLink, LoaderCircle, Search, SearchX, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { fmtLongDate, fmtTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useNow } from '@/features/schedule/hooks';
import { useManyWeekLessons } from '@/features/schedule/week-lessons';
import { lessonsOnDay, occupancyAt, type Occupancy } from '@/features/schedule/occupancy';
import { DayStrip, durationText, occupancyText } from '@/features/schedule/DayStrip';
import { splitPerson, type Lesson } from '@/features/schedule/lessons';
import { compareText, directoryPath, schedulePath, searchEntries, useDirectory, type DirectoryEntry } from '@/features/people/directory';

type Filter = 'all' | 'free' | 'busy';
type Sort = 'name' | 'free';

interface Row {
  room: DirectoryEntry;
  lessons?: Lesson[];
  occupancy?: Occupancy;
  pending: boolean;
  error: unknown;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fromLocalInput = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function RoomsPage() {
  const school = useSchoolId();
  const directory = useDirectory('lokale');
  const lectioUrl = pageUrl(school, directoryPath('lokale'));

  return (
    <Page wide>
      <PageHeader
        title="Lokaler"
        description="Find et ledigt lokale, og se hvad der foregår hvor."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a href={lectioUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        }
      />
      {directory.isPending ? (
        <RoomsSkeleton />
      ) : directory.error ? (
        <Card>
          <ErrorState error={directory.error} onRetry={() => directory.refetch()} href={lectioUrl} />
        </Card>
      ) : !directory.data.length ? (
        <Card>
          <EmptyState icon={<DoorOpen />} title="Ingen lokaler" description="Lectio viste ingen lokaler for din skole." />
        </Card>
      ) : (
        <RoomList rooms={directory.data} />
      )}
    </Page>
  );
}

function RoomList({ rooms }: { rooms: DirectoryEntry[] }) {
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const filter = (params.get('vis') as Filter) || 'all';
  const sort = (params.get('sorter') as Sort) || 'name';
  const chosen = fromLocalInput(params.get('tid'));
  const at = chosen ?? now;
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const sorted = useMemo(() => [...rooms].sort((a, b) => compareText(a.label, b.label)), [rooms]);
  const bases = useMemo(() => sorted.map((r) => schedulePath('lokale', r.id)), [sorted]);
  const weeks = useManyWeekLessons(bases, at);

  const rows: Row[] = sorted.map((room, i) => {
    const w = weeks[i];
    return { room, lessons: w?.lessons, occupancy: w?.lessons ? occupancyAt(w.lessons, at) : undefined, pending: !!w?.isPending, error: w?.error };
  });
  const loaded = rows.filter((r) => r.occupancy).length;
  const loading = rows.filter((r) => r.pending).length;
  const free = rows.filter((r) => r.occupancy?.state === 'free').length;
  const busy = rows.filter((r) => r.occupancy?.state === 'busy').length;

  const visible = useMemo(() => {
    const matching = new Set(searchEntries(sorted, query).map((r) => r.id));
    let list = rows.filter((r) => matching.has(r.room.id));
    if (filter === 'free') list = list.filter((r) => r.occupancy?.state === 'free');
    if (filter === 'busy') list = list.filter((r) => r.occupancy?.state === 'busy');
    if (sort === 'free') list = [...list].sort((a, b) => freeRank(b, at) - freeRank(a, at) || compareText(a.room.label, b.room.label));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.occupancy?.state ?? '-').join(''), query, filter, sort, at.getTime(), sorted]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setParam('q', e.target.value || null);
            }}
            placeholder="Søg efter lokale…"
            aria-label="Søg efter lokale"
            className="pl-9"
          />
          {query && (
            <button type="button" aria-label="Ryd søgning" onClick={() => (setQuery(''), setParam('q', null))} className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Segmented<Filter>
          value={filter}
          onChange={(v) => setParam('vis', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: 'Alle', count: rooms.length },
            { value: 'free', label: 'Ledige', count: free },
            { value: 'busy', label: 'Optagede', count: busy },
          ]}
        />
        <Select value={sort} onChange={(e) => setParam('sorter', e.target.value === 'name' ? null : e.target.value)} aria-label="Sortér" className="w-44">
          <option value="name">Sortér: Navn</option>
          <option value="free">Sortér: Ledig længst</option>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] shadow-card">
        <Clock className="size-4 text-fg-subtle" />
        <span className="text-fg-muted">Status</span>
        <Segmented<'now' | 'time'>
          value={chosen ? 'time' : 'now'}
          onChange={(v) => setParam('tid', v === 'now' ? null : toLocalInput(new Date(now.getTime() + 60 * 60_000)))}
          options={[
            { value: 'now', label: 'Nu' },
            { value: 'time', label: 'Vælg tidspunkt' },
          ]}
        />
        {chosen && (
          <Input type="datetime-local" value={toLocalInput(chosen)} onChange={(e) => setParam('tid', e.target.value || null)} aria-label="Tidspunkt" className="h-8 w-auto" />
        )}
        <span className="text-fg-muted first-letter:uppercase">
          {fmtLongDate(at)} kl. {fmtTime(at)}
        </span>
        <span className="ml-auto flex items-center gap-2 text-fg-subtle tabular-nums">
          {loading > 0 ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin" /> Henter status {loaded} af {rooms.length}
            </>
          ) : (
            <>
              {free} ledige · {busy} optagede
            </>
          )}
        </span>
      </div>

      {visible.length ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {visible.map((row) => (
              <RoomRow key={row.room.id} row={row} at={at} />
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<SearchX />}
            title={query ? `Ingen lokaler matcher “${query}”` : filter === 'free' ? 'Ingen ledige lokaler' : filter === 'busy' ? 'Ingen optagede lokaler' : 'Ingen lokaler'}
            description={loading > 0 ? 'Status hentes stadig for nogle lokaler.' : undefined}
          />
        </Card>
      )}
    </div>
  );
}

/** Higher is "more free": free for longest first, then busy rooms that free up soonest. */
function freeRank(row: Row, at: Date): number {
  const o = row.occupancy;
  if (!o) return -1e9;
  if (o.state === 'free') return o.freeFor ?? 24 * 60;
  return -Math.round((o.freeAt.getTime() - at.getTime()) / 60_000);
}

function RoomRow({ row, at }: { row: Row; at: Date }) {
  const { room, occupancy: o } = row;
  const day = row.lessons ? lessonsOnDay(row.lessons, at) : [];
  const current = o?.state === 'busy' ? o.lesson : null;
  const detail = current
    ? [current.hold || current.title, current.teachers.map((t) => splitPerson(t).code).join(', ')].filter(Boolean).join(' · ')
    : o?.state === 'free' && o.next
      ? `Næste: ${fmtTime(o.next.startDate)} ${o.next.hold || o.next.title}`
      : o?.state === 'free'
        ? day.length ? 'Ikke flere bookinger i dag' : 'Ingen bookinger i dag'
        : '';
  return (
    <li>
      <Link to={`/rooms/${encodeURIComponent(room.id)}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70 sm:gap-4">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', o?.state === 'busy' ? 'bg-danger-soft text-danger-soft-fg' : o?.state === 'free' ? 'bg-success-soft text-success-soft-fg' : 'bg-surface-2 text-fg-subtle')}>
          <DoorOpen className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-fg">{room.label}</div>
          <div className="truncate text-[12.5px] text-fg-muted">{row.error ? 'Kunne ikke hente lokalets skema' : detail || ' '}</div>
        </div>
        <div className="hidden w-44 shrink-0 lg:block">{row.lessons && <DayStrip lessons={day} at={at} />}</div>
        <div className="w-36 shrink-0 text-right">
          {o ? (
            <div className="flex flex-col items-end gap-0.5">
              <Badge tone={o.state === 'busy' ? 'danger' : 'success'}>{o.state === 'busy' ? 'Optaget' : 'Ledig'}</Badge>
              <span className="text-[12px] text-fg-subtle tabular-nums">
                {o.state === 'free' && o.freeFor != null ? `${durationText(o.freeFor)} fri` : occupancyText(o).replace(/^(Ledig|Optaget) /, '')}
              </span>
            </div>
          ) : row.pending ? (
            <Skeleton className="ml-auto h-5 w-16 rounded-full" />
          ) : (
            <Badge tone="outline">Ukendt</Badge>
          )}
        </div>
        <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

function RoomsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Indlæser lokaler">
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-11 rounded-xl" />
      <Card className="divide-y divide-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}
