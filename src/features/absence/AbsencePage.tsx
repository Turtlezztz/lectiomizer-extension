import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, CheckCircle2, ExternalLink, History, Pencil, UserCheck } from 'lucide-react';
import { readAbsence } from '@/lib/lectio/readers/absence.js';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { appRoute, pageUrl, PATHS } from '@/lib/lectio/paths';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { Page, PageHeader } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { absenceTone, groupByWeek, lessonWhen, parseAmount, parsePercent, type AbsenceData, type AbsenceRow, type AbsenceTable, type AbsenceTone } from './absence-utils';

const SCALE_MAX = 20;
const BAR: Record<AbsenceTone, string> = { ok: 'bg-fg-muted', warn: 'bg-warning', high: 'bg-danger' };

export default function AbsencePage() {
  const school = useSchoolId();
  const href = pageUrl(school, PATHS.absence);
  const { data, isPending, error, refetch } = useLectioPage(PATHS.absence, readAbsence);
  const absence = data?.data as AbsenceData | undefined;

  // After registering a cause in Lectio (new tab), reload when the user comes back.
  const awaitingReturn = useRef(false);
  useEffect(() => {
    const onReturn = () => {
      if (awaitingReturn.current && document.visibilityState === 'visible') {
        awaitingReturn.current = false;
        refetch();
      }
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [refetch]);
  const onEdit = () => {
    awaitingReturn.current = true;
  };

  return (
    <Page>
      <PageHeader
        title="Fravær"
        description="Dit samlede fravær, manglende årsager og registreringer"
        actions={
          <Button size="sm" variant="ghost" asChild>
            <a href={href} target="_blank" rel="noreferrer"><ExternalLink /> Åbn i Lectio</a>
          </Button>
        }
      />
      {isPending ? <AbsenceSkeleton /> : error ? (
        <Card><ErrorState error={error} onRetry={() => refetch()} href={href} /></Card>
      ) : absence ? (
        <div className="space-y-6">
          <Totals totals={absence.totals} missing={absence.missing?.rows.length ?? null} />
          {absence.missing && <MissingCard table={absence.missing} onEdit={onEdit} />}
          {absence.history && <HistoryCard table={absence.history} onEdit={onEdit} />}
        </div>
      ) : null}
    </Page>
  );
}

function Totals({ totals, missing }: { totals: AbsenceData['totals']; missing: number | null }) {
  if (!totals.length && missing === null) return null;
  return (
    <section aria-label="Samlet fravær" className={cn('grid gap-3', totals.length + (missing !== null ? 1 : 0) > 2 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2')}>
      {totals.map((t) => <TotalTile key={t.label} label={t.label} value={t.value} />)}
      {missing !== null && (
        <Card className={cn('flex flex-col justify-between gap-3 p-4', totals.length % 2 === 0 && 'col-span-2 lg:col-span-1', missing > 0 && 'border-warning/40 bg-warning-soft/40')}>
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-muted">
            {missing > 0 ? <AlertCircle className="size-3.5 text-warning" /> : <CheckCircle2 className="size-3.5 text-success" />} Mangler årsag
          </p>
          <div>
            <p className={cn('text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums', missing > 0 ? 'text-warning-soft-fg' : 'text-fg')}>{missing}</p>
            <p className="mt-1.5 text-[12px] text-fg-subtle">{missing === 0 ? 'Alt er registreret' : missing === 1 ? 'fraværsregistrering' : 'fraværsregistreringer'}</p>
          </div>
        </Card>
      )}
    </section>
  );
}

function TotalTile({ label, value }: { label: string; value: string }) {
  const pct = parsePercent(value);
  const tone = pct === null ? 'ok' : absenceTone(pct);
  return (
    <Card className="flex flex-col justify-between gap-3 p-4">
      <p className="text-[12.5px] font-medium text-fg-muted">{label || 'Fravær'}</p>
      <div>
        <p className={cn('text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums', tone === 'high' ? 'text-danger-soft-fg' : tone === 'warn' ? 'text-warning-soft-fg' : 'text-fg')}>{value}</p>
        {pct !== null && (
          <div className="mt-3">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
              <div className={cn('h-full rounded-full transition-[width] duration-500', BAR[tone])} style={{ width: `${Math.min(100, (pct / SCALE_MAX) * 100)}%` }} />
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-surface" />
            </div>
            <div className="mt-1 flex justify-between text-[10.5px] text-fg-subtle tabular-nums">
              <span>0 %</span><span>10 %</span><span>{SCALE_MAX} %</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function LessonCell({ row }: { row: AbsenceRow }) {
  const route = appRoute(row.lesson?.href);
  const holds = row.lesson?.holds ?? [];
  const meta = row.lesson ? [...holds, ...row.lesson.teachers, row.lesson.room].filter(Boolean).join(' · ') : '';
  const color = subjectColor(holds[0] || '');
  const label = lessonWhen(row);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: holds.length ? color.bar : 'var(--color-border-strong)' }} />
      <div className="min-w-0">
        {route ? (
          <Link to={route} className="block truncate text-[13.5px] font-medium text-fg hover:text-accent">{label}</Link>
        ) : (
          <p className="truncate text-[13.5px] font-medium text-fg">{label}</p>
        )}
        {meta && <p className="truncate text-[12px] text-fg-subtle">{meta}</p>}
      </div>
    </div>
  );
}

function AmountBadge({ amount }: { amount: string }) {
  const { label, percent } = parseAmount(amount);
  if (percent === null) return amount ? <Badge>{amount}</Badge> : null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-muted tabular-nums" title={amount}>
      <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
        <circle cx="8" cy="8" r="6" fill="none" strokeWidth="3" className="stroke-surface-3" />
        <circle cx="8" cy="8" r="6" fill="none" strokeWidth="3" pathLength={100} strokeDasharray={`${Math.min(100, percent)} 100`} className="stroke-fg-muted" />
      </svg>
      <span><span className="font-medium text-fg">{percent} %</span>{label && <span className="hidden sm:inline"> {label.toLowerCase()}</span>}</span>
    </span>
  );
}

function MissingCard({ table, onEdit }: { table: AbsenceTable; onEdit: () => void }) {
  const [all, setAll] = useState(false);
  const rows = all ? table.rows : table.rows.slice(0, 8);
  const count = table.rows.length;
  return (
    <Card className={cn(count > 0 && 'ring-1 ring-warning/30')}>
      <CardHeader
        icon={count > 0 ? <AlertCircle className="text-warning" /> : <UserCheck />}
        title={<span className="flex items-center gap-2">Mangler fraværsårsag {count > 0 && <Badge tone="warning">{count}</Badge>}</span>}
        description={count > 0 ? 'Angiv en årsag i Lectio. Listen opdateres, når du vender tilbage hertil.' : undefined}
      />
      {count ? (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {rows.map((row, i) => (
              <li key={(row.edit || '') + i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-5 py-3 sm:flex">
                <LessonCell row={row} />
                {row.remark && <span className="hidden max-w-48 truncate text-[12.5px] text-fg-muted italic md:inline" title={row.remark}>“{row.remark}”</span>}
                <AmountBadge amount={row.amount} />
                {row.edit && (
                  <Button size="sm" variant="primary" asChild className="col-span-2 h-8 sm:h-7">
                    <a href={row.edit} target="_blank" rel="noreferrer" onClick={onEdit}><Pencil /> Angiv årsag</a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {count > rows.length && (
            <div className="border-t border-border px-5 py-2.5">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>Vis alle {count}</Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState className="border-t border-border py-8" icon={<CheckCircle2 />} title="Ingen manglende årsager" description={table.empty || 'Alt dit fravær har en registreret årsag.'} />
      )}
    </Card>
  );
}

type Filter = 'all' | 'cause' | 'none';

function HistoryCard({ table, onEdit }: { table: AbsenceTable; onEdit: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => ({ cause: table.rows.filter((r) => r.cause).length, none: table.rows.filter((r) => !r.cause).length }), [table]);
  const rows = table.rows.filter((r) => (filter === 'all' ? true : filter === 'cause' ? !!r.cause : !r.cause));
  const weeks = groupByWeek(rows);
  return (
    <Card>
      <CardHeader
        icon={<History />}
        title="Registreringer"
        description={`${table.rows.length} ${table.rows.length === 1 ? 'registrering' : 'registreringer'} i alt`}
        action={table.rows.length > 0 ? (
          <Segmented<Filter>
            className="hidden sm:inline-flex"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'all', label: 'Alle' }, { value: 'cause', label: 'Med årsag', count: counts.cause }, { value: 'none', label: 'Uden årsag', count: counts.none }]}
          />
        ) : undefined}
      />
      {table.rows.length > 0 && (
        <div className="px-5 pb-3 sm:hidden">
          <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Alle' }, { value: 'cause', label: 'Med årsag', count: counts.cause }, { value: 'none', label: 'Uden', count: counts.none }]} />
        </div>
      )}
      {rows.length ? (
        <div className="border-t border-border">
          {weeks.map(({ week, rows: items }) => (
            <section key={week} aria-label={week ? `Uge ${week}` : 'Uden uge'}>
              {week && <h3 className="bg-surface-2 px-5 py-1.5 text-[12px] font-medium text-fg-muted">Uge {week}</h3>}
              <ul className="divide-y divide-border">
                {items.map((row, i) => (
                  <li key={(row.edit || '') + i} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]">
                    <LessonCell row={row} />
                    <div className="col-span-2 min-w-0 pl-4 md:col-span-1 md:pl-0 order-last md:order-none">
                      <div className="flex items-center gap-2">
                        {row.cause ? <Badge tone="success">{row.cause}</Badge> : <Badge tone="warning">Ingen årsag</Badge>}
                        {row.edit && (
                          <a href={row.edit} target="_blank" rel="noreferrer" onClick={onEdit} className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-muted hover:text-accent md:hidden">
                            <Pencil className="size-3" /> Ret
                          </a>
                        )}
                      </div>
                      {(row.comment || row.remark) && (
                        <p className="mt-1 truncate text-[12px] text-fg-subtle" title={[row.comment, row.remark].filter(Boolean).join(' · ')}>
                          {[row.comment, row.remark].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <AmountBadge amount={row.amount} />
                      {(row.registered || row.registeredBy) && (
                        <p className="mt-0.5 text-[11.5px] whitespace-nowrap text-fg-subtle">{[row.registered, row.registeredBy && `af ${row.registeredBy}`].filter(Boolean).join(' ')}</p>
                      )}
                    </div>
                    {row.edit ? (
                      <Button size="icon-sm" variant="ghost" asChild className="hidden md:inline-flex">
                        <a href={row.edit} target="_blank" rel="noreferrer" onClick={onEdit} title="Ret fraværsårsag i Lectio" aria-label={`Ret fraværsårsag for ${lessonWhen(row)}`}><Pencil /></a>
                      </Button>
                    ) : <span className="hidden md:block" />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState className="border-t border-border py-8" icon={<History />} title={table.rows.length ? 'Ingen registreringer i dette filter' : 'Ingen registreringer'} description={table.rows.length ? undefined : table.empty || 'Du har ikke noget registreret fravær.'} />
      )}
    </Card>
  );
}

function AbsenceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Indlæser fravær">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-1.5 w-full" />
          </Card>
        ))}
      </div>
      {[3, 5].map((n, k) => (
        <Card key={k} className="p-5">
          <Skeleton className="mb-5 h-4 w-44" />
          <div className="space-y-4">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-1" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
                <Skeleton className="h-7 w-24 rounded-md" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
