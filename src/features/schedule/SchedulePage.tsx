import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarX2, ChevronLeft, ChevronRight, Clock, Columns2, ExternalLink, Loader2, StickyNote, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { getPage } from '@/lib/lectio/client';
import { pageUrl, PATHS } from '@/lib/lectio/paths';
import { useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';
import { Page, PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { toLessons, dominant, type Lesson, type RawLesson } from './lessons';
import { WeekGrid, WeekGridSkeleton, type Day } from './WeekGrid';
import { AgendaSkeleton, DayAgenda, DayPicker } from './DayAgenda';
import { useDarkClass, useNow } from './hooks';
import { inSchoolYear, isPastTerm, sameDayIn, schoolYearOf, termLabel } from '@/lib/lectio/term';
import { useSwitchTerm, useTerm } from '@/lib/lectio/useTerm';
import { addDays, dayKey, fmtRange, mondayOf, parseWeekParam, relativeWeek, sameWeek, shiftWeek, weekDates, weekOf, weekParam, weekPath, type WeekRef } from './week';
import { commonFree, gapsOfDay } from './free-time';
import { holdChoices, splitHidden } from './hidden-holds';
import { ComparePicker, HiddenBadge, ScheduleMenu, meetText, useAssignments, useCompare, useHiddenHolds, useIcsExport, useNextSchoolDay } from './extras';
import './print.css';

const read = readSchedule as (doc: Document) => RawLesson[];
const NONE: string[] = [];
/** Warm the cache for neighbouring weeks (same key shape as useLectioPage). */
function usePrefetchWeeks(base: string, center: WeekRef | null) {
  const client = useQueryClient();
  const school = useSchoolId();
  useEffect(() => {
    if (!center) return;
    const id = setTimeout(() => {
      for (const n of [1, -1]) {
        const url = pageUrl(school, weekPath(base, shiftWeek(center, n)));
        client.prefetchQuery<Loaded<RawLesson[]>>({
          queryKey: ['lectio', url, readSchedule.name],
          queryFn: async () => {
            const doc = await getPage(url);
            return { doc, data: read(doc), url };
          },
          staleTime: 60_000,
        });
      }
    }, 250);
    return () => clearTimeout(id);
  }, [client, school, base, center?.week, center?.year]);
}

export default function SchedulePage() {
  return (
    <Page wide>
      <WeekSchedule base={PATHS.schedule} eyebrow="Skema" own />
    </Page>
  );
}

/**
 * A week of a Lectio schedule (SkemaNy.aspx): your own, or a student's,
 * teacher's or room's when `base` carries ?type=…. The week lives in ?week=.
 */
export function WeekSchedule({ base, eyebrow, emptyText, keys = true, own = false }: { base: string; eyebrow?: ReactNode; emptyText?: (week: number) => string; keys?: boolean; /** The student's own schedule: extras such as compare, hidden holds, workload, export. */ own?: boolean }) {
  useDarkClass(); // subject colours depend on the theme
  const now = useNow();
  const school = useSchoolId();
  const [params, setParams] = useSearchParams();
  const term = useTerm();
  const past = isPastTerm(term, now);
  // Lectio only shows weeks of the chosen school year. In an earlier year, open
  // the same week of that year instead of today's (which Lectio would replace
  // with an empty week 31).
  const home: WeekRef = past ? weekOf(sameDayIn(term!.year, now)) : weekOf(now);
  const requested = parseWeekParam(params.get('week')) ?? (past ? home : null);
  const path = weekPath(base, requested);
  const { data, isPending, error, refetch } = useLectioPage(path, read);

  const allLessons = useMemo(() => toLessons(data?.data), [data]);
  const current = weekOf(now);
  // Without ?week Lectio picks the week (normally the current one); follow
  // whatever week its lessons are in so the header matches what we show.
  const shown: WeekRef = requested ?? (allLessons.length ? weekOf(dominant(allLessons, (l) => weekParam(weekOf(l.startDate)))!.startDate) : current);
  const dates = weekDates(shown);
  const weekKeys = new Set(dates.map(dayKey));

  // Own schedule only: hidden holds, comparing with someone, workload, next school day.
  const holds = useHiddenHolds();
  const hiddenHolds = own ? holds.hidden : NONE;
  const split = useMemo(() => splitHidden(allLessons, hiddenHolds), [allLessons, hiddenHolds]);
  const lessons = split.shown;
  const hiddenInWeek = split.hidden.filter((l) => weekKeys.has(l.day)).length;
  const compare = useCompare(mondayOf(shown), own);
  const comparing = own && !!compare.person && !!compare.lessons;
  const assignments = useAssignments(own && !past);
  const [picking, setPicking] = useState(false);
  const ics = useIcsExport({ hidden: hiddenHolds, assignments: assignments.items });

  const days: Day[] = useMemo(() => {
    const byDay = new Map<string, Lesson[]>();
    for (const l of lessons) byDay.set(l.day, [...(byDay.get(l.day) || []), l]);
    const otherByDay = new Map<string, Lesson[]>();
    if (comparing) for (const l of compare.lessons!) otherByDay.set(l.day, [...(otherByDay.get(l.day) || []), l]);
    return dates
      .map((date, index) => {
        const key = dayKey(date);
        const mine = byDay.get(key) || [];
        const other = comparing ? otherByDay.get(key) || [] : undefined;
        return {
          date,
          index,
          lessons: mine,
          compare: other,
          free: !own ? undefined : other ? commonFree(mine, other) : gapsOfDay(mine),
          load: own && assignments.load ? (assignments.load.get(key) ?? null) : undefined,
        };
      })
      .filter((d) => d.index < 5 || d.lessons.length > 0 || !!d.compare?.length);
  }, [lessons, shown.week, shown.year, comparing, compare.lessons, own, assignments.load]);
  const inWeek = days.flatMap((d) => d.lessons);
  const nextDay = useNextSchoolDay(sameWeek(shown, current) && data ? lessons : null, now, hiddenHolds, own && !past);

  usePrefetchWeeks(base, data ? shown : null);

  const go = useCallback(
    (n: number) => {
      setParams((p) => { const next = new URLSearchParams(p); next.set('week', weekParam(shiftWeek(shown, n))); return next; }, { replace: true });
    },
    [shown.week, shown.year, setParams],
  );
  const isCurrent = sameWeek(shown, home);
  const goToday = useCallback(() => {
    if (!isCurrent) setParams((p) => { const next = new URLSearchParams(p); next.set('week', weekParam(home)); return next; }, { replace: true });
  }, [isCurrent, home.week, home.year, setParams]);
  // The week's Thursday decides its school year (as for ISO weeks).
  const weekYear = schoolYearOf(addDays(mondayOf(shown), 3));
  const outsideTerm = !!term && !inSchoolYear(term.year, addDays(mondayOf(shown), 3));
  const switcher = useSwitchTerm();

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 't' || e.key === 'T') goToday();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, goToday, keys]);

  // Mobile: selected day. Default to today when it is in view, else the first day with lessons.
  const [picked, setPicked] = useState<{ week: string; index: number } | null>(null);
  const todayIdx = days.find((d) => dayKey(d.date) === dayKey(now))?.index;
  const selected =
    picked && picked.week === weekParam(shown) && days.some((d) => d.index === picked.index)
      ? picked.index
      : (todayIdx ?? days.find((d) => d.lessons.length)?.index ?? 0);
  const selectedDay = days.find((d) => d.index === selected) ?? days[0];

  const visibleRange = fmtRange(days[0].date, days[days.length - 1].date);
  const rel = relativeWeek(shown, now);
  const changed = inWeek.filter((l) => l.status === 'changed').length;
  const cancelled = inWeek.filter((l) => l.status === 'cancelled').length;
  const homework = inWeek.filter((l) => l.hasHomework && l.status !== 'cancelled').length;

  return (
    <div className={cn(own && 'lx-schedule-print')}>
      <PageHeader
        eyebrow={eyebrow}
        title={
          <span className="flex items-center gap-3">
            <span className="tabular-nums">Uge {shown.week}</span>
            {past ? (
              <Badge tone="warning" className="translate-y-px">{termLabel(term!.year)}</Badge>
            ) : (
              rel && <Badge tone={rel === 'Denne uge' ? 'accent' : 'neutral'} className="translate-y-px">{rel}</Badge>
            )}
          </span>
        }
        description={
          <>
            <span className="tabular-nums">{visibleRange}</span>
            {nextDay && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-fg-subtle tabular-nums">
                <Clock className="size-3.5" /> {meetText(nextDay, now)}
              </span>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2 print:hidden">
            {own && (
              <ScheduleMenu
                holds={holdChoices(allLessons.filter((l) => weekKeys.has(l.day)), holds.hidden)}
                hidden={holds.hidden}
                onToggleHold={holds.toggle}
                comparing={!!compare.person}
                onCompare={compare.set}
                onSearch={() => setPicking(true)}
                onExport={ics.run}
                exporting={ics.busy}
              />
            )}
            <Button variant="ghost" size="icon" asChild title="Åbn i Lectio" aria-label="Åbn i Lectio">
              <a href={pageUrl(school, weekPath(base, shown))} target="_blank" rel="noreferrer">
                <ExternalLink />
              </a>
            </Button>
            <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 shadow-card">
              <Button variant="ghost" size="icon-sm" aria-label="Forrige uge" title="Forrige uge (←)" onClick={() => go(-1)}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToday} disabled={isCurrent} title={past ? `Samme uge i ${termLabel(term!.year)} (T)` : 'Gå til i dag (T)'} className="px-3">
                I dag
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Næste uge" title="Næste uge (→)" onClick={() => go(1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        }
      />
      {own && <ComparePicker open={picking} onOpenChange={setPicking} onPick={(f) => compare.set(f)} />}
      {ics.message && (
        <p role="status" className={cn('-mt-3 mb-4 flex items-center gap-2 text-[13px] print:hidden', ics.error ? 'text-danger-soft-fg' : 'text-fg-muted')}>
          {ics.busy && <Loader2 className="size-3.5 animate-spin" />}
          {ics.message}
          {!ics.busy && (
            <button type="button" onClick={ics.dismiss} aria-label="Luk" className="rounded p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </p>
      )}

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={pageUrl(school, path)} />
        </Card>
      ) : isPending ? (
        <>
          <div className="mb-4 hidden gap-2 md:flex">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="hidden md:block">
            <WeekGridSkeleton />
          </div>
          <div className="md:hidden">
            <AgendaSkeleton />
          </div>
        </>
      ) : inWeek.length === 0 && outsideTerm ? (
        <Card>
          <EmptyState
            icon={<CalendarX2 />}
            title={`Uge ${shown.week} hører til skoleåret ${termLabel(weekYear)}`}
            description={`Lectio viser kun uger fra det valgte skoleår, ${termLabel(term!.year)}.`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {term!.options.some((o) => o.year === weekYear) && (
                  <Button size="sm" disabled={switcher.isPending} onClick={() => switcher.mutate(weekYear)}>
                    Skift til {termLabel(weekYear)}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={goToday}>
                  Gå til uge {home.week}
                </Button>
              </div>
            }
          />
        </Card>
      ) : inWeek.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarX2 />}
            title="Ingen moduler denne uge"
            description={
              (emptyText ? emptyText(shown.week) : `Der er ikke noget på dit skema i uge ${shown.week}.`) +
              (hiddenInWeek ? ` ${hiddenInWeek} ${hiddenInWeek === 1 ? 'modul er' : 'moduler er'} skjult.` : '')
            }
            action={
              (hiddenInWeek > 0 || !isCurrent) && (
                <div className="flex flex-wrap justify-center gap-2">
                  {hiddenInWeek > 0 && (
                    <Button size="sm" variant="secondary" onClick={() => holds.show('all')}>
                      Vis skjulte hold
                    </Button>
                  )}
                  {!isCurrent && (
                    <Button size="sm" onClick={goToday}>
                      Gå til denne uge
                    </Button>
                  )}
                </div>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
            <Badge tone="outline" className="tabular-nums">
              {inWeek.length - cancelled} moduler
            </Badge>
            {changed > 0 && <Badge tone="accent" className="tabular-nums">{changed} ændret</Badge>}
            {cancelled > 0 && <Badge tone="danger" className="tabular-nums">{cancelled} aflyst</Badge>}
            {homework > 0 && (
              <Badge tone="info" className="tabular-nums">
                <BookOpen /> {homework} med lektier
              </Badge>
            )}
            {own && <HiddenBadge count={hiddenInWeek} hidden={holds.hidden} onToggle={holds.toggle} onShowAll={() => holds.show('all')} />}
            {own && compare.person && (
              <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full pr-1 pl-2.5 text-[12px] font-medium print:pr-2.5', compare.error ? 'bg-danger-soft text-danger-soft-fg' : 'bg-success-soft text-success-soft-fg')}>
                {compare.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Columns2 className="size-3.5" />}
                {compare.error ? `${compare.name}s skema kunne ikke hentes` : compare.isPending ? `Henter ${compare.name}s skema…` : `Sammenlignet med ${compare.name} · grøn: I har begge fri`}
                <button type="button" onClick={() => compare.set(null)} aria-label="Stop sammenligning" title="Stop sammenligning" className="rounded-full p-0.5 hover:bg-surface/60 print:hidden">
                  <X className="size-3.5" />
                </button>
              </span>
            )}
            <span className="ml-auto hidden items-center gap-3 text-[12px] text-fg-subtle lg:flex">
              <span className="inline-flex items-center gap-1"><BookOpen className="size-3.5" /> Lektier</span>
              <span className="inline-flex items-center gap-1"><StickyNote className="size-3.5" /> Note</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] ring-2 ring-accent" /> Ændret</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-fg-subtle/40" /> Aflyst</span>
              <span className="text-fg-subtle/80 print:hidden">← → skifter uge</span>
            </span>
          </div>
          <div className="lx-print-grid hidden md:block">
            <WeekGrid days={days} now={now} compareName={comparing ? compare.name : undefined} />
          </div>
          <div className={cn('lx-print-agenda space-y-4 md:hidden')}>
            <DayPicker days={days} selected={selected} onSelect={(index) => setPicked({ week: weekParam(shown), index })} now={now} />
            <DayAgenda day={selectedDay} now={now} compareName={comparing ? compare.name : undefined} />
          </div>
        </>
      )}
    </div>
  );
}
