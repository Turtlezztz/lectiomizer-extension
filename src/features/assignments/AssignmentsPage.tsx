import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ChevronRight, ClipboardList, ExternalLink, LoaderCircle, PartyPopper, Search, SearchX, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useLectioAction, useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { PATHS, appRoute, pageUrl } from '@/lib/lectio/paths';
import { readAssignments } from '@/lib/lectio/readers/assignments.js';
import { fmtDate, fmtTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { GROUPS, checkboxTarget, deadlineHint, groupAssignments, groupOf, holdsOf, hoursLabel, matches, type AssignmentItem, type AssignmentsData, type Group } from './model';
import { InlineError, StatusBadge, SubjectDot, UrgencyBadge } from './parts';

type View = 'all' | Group;

const read = readAssignments as (doc: Document) => AssignmentsData;

export default function AssignmentsPage() {
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.assignments, read);
  const lectioUrl = pageUrl(school, PATHS.assignments);

  return (
    <Page>
      <PageHeader
        title="Opgaver"
        description={loaded ? <Summary items={loaded.data.assignments} /> : 'Dine afleveringer fra Lectio'}
        actions={
          loaded && (
            <Button variant="ghost" size="sm" asChild>
              <a href={lectioUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Åbn i Lectio
              </a>
            </Button>
          )
        }
      />
      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : (
        <AssignmentList loaded={loaded!} />
      )}
    </Page>
  );
}

function Summary({ items }: { items: AssignmentItem[] }) {
  const now = new Date();
  const upcoming = items.filter((a) => groupOf(a, now) === 'upcoming').length;
  const missing = items.filter((a) => groupOf(a, now) === 'missing').length;
  if (!items.length) return <>Dine afleveringer fra Lectio</>;
  return (
    <>
      {upcoming} kommende
      {missing > 0 && (
        <>
          {' · '}
          <span className="font-medium text-danger-soft-fg">{missing} mangler</span>
        </>
      )}
    </>
  );
}

function AssignmentList({ loaded }: { loaded: Loaded<AssignmentsData> }) {
  const data = loaded.data;
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const [hold, setHold] = useState('');
  const now = useMemo(() => new Date(), [data]);
  const holds = useMemo(() => holdsOf(data.assignments), [data.assignments]);
  const visible = useMemo(() => data.assignments.filter((a) => matches(a, search, hold)), [data.assignments, search, hold]);
  const grouped = useMemo(() => groupAssignments(visible, now), [visible, now]);
  const filtered = search.trim() !== '' || hold !== '';

  const options = [
    { value: 'all' as View, label: 'Alle', count: visible.length },
    ...GROUPS.map((g) => ({ value: g.id as View, label: g.title, count: grouped[g.id].length })),
  ];
  // Kommende first in the list; Mangler gets attention from its colour instead.
  const order: Group[] = ['upcoming', 'missing', 'delivered'];
  const shown = order.filter((g) => grouped[g].length > 0 && (view === 'all' || view === g));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented value={view} onChange={setView} options={options} className="self-start overflow-x-auto max-sm:w-full max-sm:[&>button]:flex-1 max-sm:[&>button]:px-2" />
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <label className="relative min-w-0 flex-1 basis-56 lg:max-w-72">
            <span className="sr-only">Søg i opgaver</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg i opgaver…" className="pl-9" />
          </label>
          {holds.length > 1 && (
            <label className="relative">
              <span className="sr-only">Vis hold</span>
              <select
                value={hold}
                onChange={(e) => setHold(e.target.value)}
                className={cn(
                  'h-9 appearance-none rounded-lg border border-border bg-surface pr-8 pl-3 text-sm text-fg outline-none hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent/15',
                  hold && 'border-accent/50 bg-accent-soft/50',
                )}
              >
                <option value="">Alle hold</option>
                {holds.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 rotate-90 text-fg-subtle" />
            </label>
          )}
        </div>
      </div>

      <LectioFilters loaded={loaded} />

      {!data.assignments.length ? (
        <Card>
          <EmptyState icon={<ClipboardList />} title={data.empty || 'Der er ingen opgaver'} description="Når dine lærere stiller opgaver i Lectio, dukker de op her." />
        </Card>
      ) : !visible.length ? (
        <Card>
          <EmptyState
            icon={<SearchX />}
            title="Ingen opgaver matcher"
            description="Prøv et andet søgeord eller vælg et andet hold."
            action={
              filtered && (
                <Button size="sm" onClick={() => { setSearch(''); setHold(''); }}>
                  <X /> Nulstil filtre
                </Button>
              )
            }
          />
        </Card>
      ) : !shown.length ? (
        <Card>
          <GroupEmpty group={view as Group} />
        </Card>
      ) : (
        shown.map((g) => <GroupSection key={g} group={g} items={grouped[g]} now={now} />)
      )}
    </div>
  );
}

function GroupEmpty({ group }: { group: Group }) {
  if (group === 'missing') return <EmptyState icon={<PartyPopper />} title="Intet mangler" description="Du er helt med – der er ingen overskredne afleveringer." />;
  if (group === 'upcoming') return <EmptyState icon={<CheckCircle2 />} title="Ingen kommende opgaver" description="Der er ingen åbne afleveringer lige nu." />;
  return <EmptyState icon={<ClipboardList />} title="Intet afleveret endnu" description="Afleverede opgaver samles her." />;
}

/** Lectio's own list filters ("Vis kun aktuelle", …) – each toggle is a postback. */
function LectioFilters({ loaded }: { loaded: Loaded<AssignmentsData> }) {
  const action = useLectioAction(loaded, read);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  if (!loaded.data.filters.length) return null;

  const toggle = (filter: AssignmentsData['filters'][number]) => {
    const input = filter.source;
    const next = !filter.checked;
    // serializeForm reads the checkbox state from the loaded document, so set it
    // there before posting back; restore it if Lectio does not answer.
    const set = (on: boolean) => {
      input.checked = on;
      if (on) input.setAttribute('checked', 'checked');
      else input.removeAttribute('checked');
    };
    set(next);
    setPendingLabel(filter.label);
    action.mutate(
      { target: checkboxTarget(input), argument: '' },
      { onError: () => set(!next), onSettled: () => setPendingLabel(null) },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-medium text-fg-subtle">Lectio-filtre</span>
        {loaded.data.filters.map((f) => (
          <button
            key={f.label}
            type="button"
            role="switch"
            aria-checked={f.checked}
            disabled={action.isPending}
            onClick={() => toggle(f)}
            className={cn(
              'inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-60',
              f.checked ? 'border-accent/30 bg-accent-soft text-accent-soft-fg' : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {pendingLabel === f.label ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <span aria-hidden className={cn('relative h-3.5 w-6 rounded-full transition-colors', f.checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-border-strong ring-inset')}>
                <span className={cn('absolute top-0.5 size-2.5 rounded-full bg-white shadow-sm transition-[left]', f.checked ? 'left-3' : 'left-0.5')} />
              </span>
            )}
            {f.label}
          </button>
        ))}
      </div>
      <InlineError error={action.error} />
    </div>
  );
}

const groupStyle: Record<Group, { title: string; accent: string }> = {
  upcoming: { title: 'Kommende', accent: 'bg-info' },
  missing: { title: 'Mangler', accent: 'bg-danger' },
  delivered: { title: 'Afleveret', accent: 'bg-success' },
};

function GroupSection({ group, items, now }: { group: Group; items: AssignmentItem[]; now: Date }) {
  const style = groupStyle[group];
  return (
    <section aria-labelledby={`group-${group}`} className="animate-in">
      <h2 id={`group-${group}`} className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-fg">
        <span aria-hidden className={cn('size-1.5 rounded-full', style.accent)} />
        {style.title}
        <span className="font-normal tabular-nums text-fg-subtle">{items.length}</span>
      </h2>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {items.map((item, i) => (
            <li key={(item.href || item.title) + i}>
              <AssignmentRow item={item} group={group} now={now} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function AssignmentRow({ item, group, now }: { item: AssignmentItem; group: Group; now: Date }) {
  const route = appRoute(item.href);
  const hours = hoursLabel(item.studentTime);
  const content = (
    <>
      <SubjectDot hold={item.hold} className="mt-1.5 sm:mt-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-fg group-hover:text-accent-soft-fg">{item.title || 'Uden titel'}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-fg-muted">
          {item.hold && <span className="shrink-0">{item.hold}</span>}
          {item.note && (
            <>
              <span aria-hidden className="text-fg-subtle">·</span>
              <span className="min-w-0 truncate text-fg-subtle" title={item.note}>{item.note}</span>
            </>
          )}
          {/* On phones the deadline lives in the meta line. */}
          <span className="tabular-nums sm:hidden">
            <span aria-hidden className="mr-2 text-fg-subtle">·</span>
            {item.deadline ? `${fmtDate(item.deadline)} ${fmtTime(item.deadline)}` : item.deadlineText || 'Ingen frist'}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
          {group === 'upcoming' && <UrgencyBadge deadline={item.deadline} now={now} />}
          <StatusBadge kind={item.statusKind} label={item.status} overdue={group === 'missing'} />
          {item.grade && <span className="text-[12px] text-fg-muted">Karakter {item.grade}</span>}
        </div>
      </div>
      <div className="hidden w-[120px] shrink-0 text-right sm:block">
        {item.deadline ? (
          <>
            <div className="text-[13px] font-medium tabular-nums text-fg">{fmtDate(item.deadline)} <span className="text-fg-muted">{fmtTime(item.deadline)}</span></div>
            <div className="text-[12px] text-fg-subtle first-letter:uppercase">{deadlineHint(item.deadline, item.week, now)}</div>
          </>
        ) : (
          <div className="text-[13px] text-fg-subtle">{item.deadlineText || 'Ingen frist'}</div>
        )}
      </div>
      <div className="hidden w-[118px] shrink-0 justify-end sm:flex">{group === 'upcoming' && <UrgencyBadge deadline={item.deadline} now={now} />}</div>
      <div className="hidden w-[132px] shrink-0 flex-col items-end gap-0.5 sm:flex">
        <StatusBadge kind={item.statusKind} label={item.status} overdue={group === 'missing'} />
        {item.grade ? <span className="text-[11.5px] text-fg-muted">Karakter {item.grade}</span> : /lærer/i.test(item.awaiting) ? <span className="text-[11.5px] text-fg-subtle">Afventer lærer</span> : null}
      </div>
      <div className="hidden w-12 shrink-0 text-right text-[12.5px] tabular-nums text-fg-muted md:block" title="Elevtid">
        {hours ?? <span className="text-fg-subtle">–</span>}
      </div>
      {route && <ChevronRight className="hidden size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 sm:block" />}
    </>
  );
  const cls = 'group flex items-start gap-3 px-4 py-3 transition-colors sm:items-center sm:px-5';
  if (route) {
    return (
      <Link to={route} className={cn(cls, 'hover:bg-surface-2 focus-visible:bg-surface-2')}>
        {content}
      </Link>
    );
  }
  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className={cn(cls, 'hover:bg-surface-2')}>
        {content}
      </a>
    );
  }
  return <div className={cls}>{content}</div>;
}

function ListSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Indlæser opgaver">
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-8 w-80 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>
      {[4, 2].map((rows, s) => (
        <div key={s} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Card className="divide-y divide-border">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="size-2.5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-1/5" />
                </div>
                <Skeleton className="hidden h-8 w-24 sm:block" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
