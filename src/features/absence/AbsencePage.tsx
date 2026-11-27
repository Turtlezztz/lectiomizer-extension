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
import { Input } from '@/components/ui/input';
import { groupByWeek, lessonWhen, parseAmount, type AbsenceData, type AbsenceRow, type AbsenceTable } from './absence-utils';
import { groupByDay, toggleAll } from './absence-calc';
import { AbsenceCalculator } from './AbsenceCalculator';
import { AbsenceBreakdown, AbsenceRemarks } from './AbsenceBreakdown';
import { useAbsenceOverview } from './useAbsenceOverview';

export default function AbsencePage() {
  const school = useSchoolId();
  const href = pageUrl(school, PATHS.absence);
  const { data, isPending, error, refetch } = useLectioPage(PATHS.absence, readAbsence);
  const absence = data?.data as AbsenceData | undefined;
  // Lectio's "Oversigt": counts per hold. Optional – the page works from the totals without it.
  const overview = useAbsenceOverview(absence?.overview ?? null).data;

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
        description="Almindeligt og skriftligt fravær, fordelt på fag, og dine registreringer"
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
          <AbsenceCalculator absence={absence} overview={overview} />
          {overview && <AbsenceRemarks remarks={overview.remarks} />}
          {overview && <AbsenceBreakdown overview={overview} />}
          {absence.missing && <MissingCard table={absence.missing} onEdit={onEdit} />}
          {absence.history && <HistoryCard table={absence.history} onEdit={onEdit} />}
        </div>
      ) : null}
    </Page>
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

const keyOf = (row: AbsenceRow) => row.edit || '';

function MissingCard({ table, onEdit }: { table: AbsenceTable; onEdit: () => void }) {
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [comment, setComment] = useState('');
  const count = table.rows.length;
  const days = useMemo(() => groupByDay(table.rows), [table]);
  // Whole days only, so "vælg hele dagen" never hides part of a day.
  const visible = useMemo(() => {
    if (all) return days;
    const out: typeof days = [];
    let n = 0;
    for (const d of days) {
      if (n >= 8) break;
      out.push(d);
      n += d.rows.length;
    }
    return out;
  }, [days, all]);
  const shown = visible.reduce((n, d) => n + d.rows.length, 0);
  // Day headers only earn their place when a day has several modules ("Vælg hele dagen"); else the row already says the date.
  const dayHeaders = days.some((d) => d.rows.length > 1);
  // Rows that got a cause disappear from Lectio's list; the selection follows automatically.
  const chosen = table.rows.filter((r) => r.edit && selected.has(keyOf(r)));
  const next = chosen.find((r) => !opened.has(keyOf(r))) ?? chosen[0];
  const done = chosen.filter((r) => opened.has(keyOf(r))).length;

  const toggle = (keys: string[]) => setSelected((s) => toggleAll(s, keys));
  const openNext = () => {
    if (!next) return;
    if (comment.trim()) navigator.clipboard?.writeText(comment.trim()).catch(() => {});
    setOpened((s) => new Set(s).add(keyOf(next)));
    onEdit();
  };
  const clear = () => {
    setSelected(new Set());
    setOpened(new Set());
  };

  return (
    <Card className={cn(count > 0 && 'ring-1 ring-warning/30')}>
      <CardHeader
        icon={count > 0 ? <AlertCircle className="text-warning" /> : <UserCheck />}
        title={<span className="flex items-center gap-2">Mangler fraværsårsag {count > 0 && <Badge tone="warning">{count}</Badge>}</span>}
        description={count ? 'Angiv en årsag i Lectio. Listen opdateres, når du vender tilbage hertil.' : undefined}
      />
      {count ? (
        <>
          <div className="border-t border-border">
            {visible.map(({ day, rows }) => {
              const keys = rows.filter((r) => r.edit).map(keyOf);
              const allOn = keys.length > 0 && keys.every((k) => selected.has(k));
              return (
                <section key={day} aria-label={day || 'Uden dato'} className={cn(!dayHeaders && 'border-b border-border last:border-b-0')}>
                  {dayHeaders && <div className="flex items-center justify-between gap-3 bg-surface-2 px-5 py-1.5 text-[12px] font-medium text-fg-muted">
                    <span className="capitalize">{day || 'Uden dato'}{rows[0]?.week && <span className="font-normal text-fg-subtle"> · uge {rows[0].week}</span>}</span>
                    {keys.length > 1 && (
                      <button type="button" onClick={() => toggle(keys)} className="text-[12px] font-medium text-fg-muted hover:text-accent">
                        {allOn ? 'Fravælg dagen' : 'Vælg hele dagen'}
                      </button>
                    )}
                  </div>}
                  <ul className="divide-y divide-border">
                    {rows.map((row, i) => {
                      const key = keyOf(row);
                      const isOn = !!row.edit && selected.has(key);
                      return (
                        <li key={key + i} className={cn('flex items-center gap-3 px-5 py-2.5 transition-colors', isOn && 'bg-accent-soft/40')}>
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-accent disabled:opacity-40"
                            checked={isOn}
                            disabled={!row.edit}
                            onChange={() => toggle([key])}
                            aria-label={`Vælg ${lessonWhen(row)}`}
                          />
                          <LessonCell row={row} />
                          {row.remark && <span className="hidden max-w-48 truncate text-[12.5px] text-fg-muted italic md:inline" title={row.remark}>“{row.remark}”</span>}
                          <AmountBadge amount={row.amount} />
                          {row.edit && (
                            <Button size="icon-sm" variant="ghost" asChild>
                              <a href={row.edit} target="_blank" rel="noreferrer" onClick={onEdit} title="Angiv årsag i Lectio" aria-label={`Angiv årsag for ${lessonWhen(row)}`}><Pencil /></a>
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          {count > shown && (
            <div className="border-t border-border px-5 py-2.5">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>Vis alle {count}</Button>
            </div>
          )}
          {chosen.length > 0 && next && (
            <div className="space-y-2 border-t border-border bg-surface-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-fg tabular-nums">{chosen.length} valgt</span>
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Fælles kommentar (valgfri)" className="h-8 min-w-40 flex-1 text-[13px]" aria-label="Fælles kommentar" />
                <Button size="sm" variant="primary" asChild className="h-8">
                  <a href={next.edit!} target="_blank" rel="noreferrer" onClick={openNext}>
                    <ExternalLink /> {chosen.length === 1 ? 'Åbn i Lectio' : `Åbn ${Math.min(done + 1, chosen.length)} af ${chosen.length} i Lectio`}
                  </a>
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={clear}>Ryd</Button>
              </div>
              <p className="text-[12px] text-fg-subtle">
                Lectio har én formular pr. modul, så vælg samme årsag i hver.{comment.trim() ? ' Kommentaren kopieres, så du kan sætte den ind.' : ''} Modulerne forsvinder herfra, når de har fået en årsag.
              </p>
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
      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <Skeleton className="mx-auto size-32 shrink-0 rounded-full sm:mx-0" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </Card>
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
