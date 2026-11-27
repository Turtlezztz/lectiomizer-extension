import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, ExternalLink, ListTree, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { readStudyPlan } from '@/lib/lectio/readers/studyplan.js';
import { fmtDate } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { useDarkClass } from '@/features/schedule/hooks';
import { currentPhases, lanes, phaseProgress, phaseState, place, timeline, type Phase, type PlanHold, type StudyPlanData, type Timeline } from './model';

const read = readStudyPlan as (doc: Document) => StudyPlanData;

export const phaseRoute = (id: string) => `/studyplan/${encodeURIComponent(id)}`;

/** "23. nov. – 18. dec."; the year only when it isn't this year (once if both share it). */
export function fmtPeriod(p: Pick<Phase, 'start' | 'end'>): string {
  if (!p.start || !p.end) return '';
  const thisYear = new Date().getFullYear();
  const same = p.start.getFullYear() === p.end.getFullYear();
  const startYear = !same || p.start.getFullYear() !== thisYear ? (same ? '' : ` ${p.start.getFullYear()}`) : '';
  const endYear = p.end.getFullYear() !== thisYear || !same ? ` ${p.end.getFullYear()}` : '';
  return `${fmtDate(p.start)}${startYear} – ${fmtDate(p.end)}${endYear}`;
}

const monthName = (d: Date) => {
  const s = d.toLocaleDateString('da-DK', { month: 'short' }).replace('.', '');
  return s.charAt(0).toLocaleUpperCase('da') + s.slice(1);
};

export default function StudyPlanPage() {
  useDarkClass(); // subject colours depend on the theme
  const school = useSchoolId();
  const [params, setParams] = useSearchParams();
  const holdId = params.get('hold') ?? '';
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.studyPlan, read);
  const lectioUrl = pageUrl(school, PATHS.studyPlan);
  const all = loaded?.data.holds;
  const holds = useMemo(() => (all ?? []).filter((h) => h.phases.length && (!holdId || h.id === holdId)), [all, holdId]);
  const now = new Date();
  const current = useMemo(() => currentPhases(holds, now), [holds]); // eslint-disable-line react-hooks/exhaustive-deps
  const phaseCount = holds.reduce((n, h) => n + h.phases.length, 0);
  const setHold = (id: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id) next.set('hold', id);
      else next.delete('hold');
      return next;
    }, { replace: true });

  return (
    <Page wide>
      <PageHeader
        title="Studieplan"
        description={all ? (phaseCount ? `${phaseCount} forløb på ${holds.length} hold` : 'Ingen forløb i studieplanen') : 'Forløbene på dine hold gennem året'}
        actions={
          <>
            {all && all.filter((h) => h.phases.length).length > 1 && (
              <Select value={holdId} onChange={(e) => setHold(e.target.value)} aria-label="Hold" className="w-44">
                <option value="">Alle hold</option>
                {all.filter((h) => h.phases.length).map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="ghost" size="sm" asChild>
              <a href={lectioUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Åbn i Lectio
              </a>
            </Button>
          </>
        }
      />
      {isPending ? (
        <PlanSkeleton />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : !holds.length ? (
        <Card>
          <EmptyState
            icon={<ListTree />}
            title="Ingen forløb"
            description={holdId ? 'Holdet har ingen forløb i studieplanen.' : 'Når dine lærere lægger forløb i studieplanen, dukker de op her.'}
            action={holdId ? <Button variant="secondary" size="sm" onClick={() => setHold('')}><X /> Vis alle hold</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {current.length > 0 && (
            <section className="animate-in">
              <h2 className="mb-2 px-1 text-[13px] font-semibold text-fg">Lige nu</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {current.map(({ hold, phase, next }) => (
                  <NowCard key={hold.id + phase.id} hold={hold} phase={phase} next={next} now={now} />
                ))}
              </div>
            </section>
          )}
          <YearTimeline holds={holds} now={now} />
          <section className="space-y-5">
            {holds.map((hold) => (
              <HoldPhases key={hold.id} hold={hold} now={now} />
            ))}
          </section>
        </div>
      )}
    </Page>
  );
}

function HoldChip({ name }: { name: string }) {
  const color = subjectColor(name);
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11.5px] font-semibold text-fg" style={{ background: `color-mix(in oklch, ${color.bar} 20%, transparent)` }}>
      {name}
    </span>
  );
}

function NowCard({ hold, phase, next, now }: { hold: PlanHold; phase: Phase; next: Phase | null; now: Date }) {
  const color = subjectColor(hold.name);
  const progress = phaseProgress(phase, now);
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color.bar }} />
      <Link to={phaseRoute(phase.id)} className="block py-3.5 pr-4 pl-6 hover:bg-surface-2/50">
        <div className="flex items-center gap-2">
          <HoldChip name={hold.name} />
          <span className="text-[12px] text-fg-subtle tabular-nums">{fmtPeriod(phase)}</span>
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-[15px] font-semibold tracking-[-0.01em] text-fg">{phase.title}</h3>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Hvor langt forløbet er">
          <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: color.bar }} />
        </div>
        {next && (
          <p className="mt-2 truncate text-[12.5px] text-fg-muted">
            Derefter: <span className="text-fg">{next.title}</span>
          </p>
        )}
      </Link>
    </Card>
  );
}

function YearTimeline({ holds, now }: { holds: PlanHold[]; now: Date }) {
  const t = useMemo(() => timeline(holds, now), [holds]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null;
  const today = (now.getTime() - t.start.getTime()) / (t.end.getTime() - t.start.getTime());
  return (
    <section className="animate-in">
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-fg">Året</h2>
      <Card className="overflow-x-auto">
        <div className="min-w-[760px] p-4">
          <div className="flex">
            <div className="w-28 shrink-0" />
            <div className="relative h-5 flex-1">
              {t.months.map((m) => (
                <span key={m.date.getTime()} className="absolute top-0 truncate border-l border-border pl-1 text-[11px] text-fg-subtle" style={{ left: `${m.left * 100}%`, width: `${m.width * 100}%` }}>
                  {monthName(m.date)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            {holds.map((hold) => (
              <TimelineRow key={hold.id} hold={hold} t={t} now={now} />
            ))}
            {today >= 0 && today <= 1 && (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 flex" style={{ left: `calc(7rem + (100% - 7rem) * ${today})` }}>
                <div className="w-px bg-danger" />
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

function TimelineRow({ hold, t, now }: { hold: PlanHold; t: Timeline; now: Date }) {
  const color = subjectColor(hold.name);
  const rows = lanes(hold.phases);
  return (
    <div className="flex border-t border-border/70 py-1.5">
      <div className="flex w-28 shrink-0 items-center pr-2 text-[12.5px] font-medium text-fg">
        <span className="truncate" title={hold.name}>{hold.name}</span>
      </div>
      <div className="relative flex-1 space-y-1">
        {t.months.map((m) => (
          <div key={m.date.getTime()} aria-hidden className="absolute inset-y-0 border-l border-border/50" style={{ left: `${m.left * 100}%` }} />
        ))}
        {rows.map((lane, i) => (
          <div key={i} className="relative h-6">
            {lane.map((p) => {
              const pos = place(t, p);
              if (!pos) return null;
              const past = phaseState(p, now) === 'past';
              return (
                <Link
                  key={p.id}
                  to={phaseRoute(p.id)}
                  title={`${p.title}\n${fmtPeriod(p)}${p.estimate ? `\n${p.estimate}` : ''}`}
                  className={cn('absolute inset-y-0 flex items-center overflow-hidden rounded-md px-1.5 text-[11.5px] font-medium text-fg ring-1 ring-black/5 transition-[filter] ring-inset hover:brightness-95 dark:ring-white/10', past && 'opacity-55')}
                  style={{ left: `${pos.left * 100}%`, width: `${pos.width * 100}%`, background: `color-mix(in oklch, ${color.bar} 30%, var(--color-surface))` }}
                >
                  <span className="truncate">{p.title}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldPhases({ hold, now }: { hold: PlanHold; now: Date }) {
  const color = subjectColor(hold.name);
  return (
    <section className="animate-in">
      <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-fg">
        {hold.name}
        <span className="text-[12px] font-normal text-fg-subtle tabular-nums">· {hold.phases.length} forløb</span>
        {hold.hours?.total != null && (
          <span className="text-[12px] font-normal text-fg-subtle tabular-nums">
            · elevtid {String(hold.hours.total).replace('.', ',')} t.{hold.hours.norm != null && ` (norm ${String(hold.hours.norm).replace('.', ',')} t.)`}
          </span>
        )}
      </h2>
      <Card className="divide-y divide-border overflow-hidden">
        {hold.phases.map((p) => {
          const state = phaseState(p, now);
          return (
            <Link key={p.id} to={phaseRoute(p.id)} className={cn('flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60', state === 'past' && 'text-fg-muted')}>
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', state === 'past' && 'opacity-40')} style={{ background: color.bar }} />
              <span className={cn('min-w-0 flex-1 truncate text-[14px]', state === 'past' ? 'text-fg-muted' : 'font-medium text-fg')}>{p.title}</span>
              {state === 'now' && <Badge tone="accent">Nu</Badge>}
              <span className="hidden shrink-0 text-[12.5px] text-fg-subtle tabular-nums sm:inline">{fmtPeriod(p)}</span>
              {p.estimate && <span className="hidden shrink-0 text-[12.5px] text-fg-subtle tabular-nums md:inline">{p.estimate}</span>}
              <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
            </Link>
          );
        })}
      </Card>
    </section>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Indlæser studieplan">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-56" />
      <Skeleton className="h-40" />
    </div>
  );
}
