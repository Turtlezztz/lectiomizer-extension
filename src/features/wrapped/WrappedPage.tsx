import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, CalendarRange, CalendarX2, ClipboardCheck, Clock, Download, DoorOpen, LoaderCircle, UserX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { useAccount, useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { readAssignments } from '@/lib/lectio/readers/assignments.js';
import { readAbsence } from '@/lib/lectio/readers/absence.js';
import { schoolYearOf, termLabel } from '@/lib/lectio/term';
import { useTermOptions } from '@/lib/lectio/useTerm';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import type { AssignmentsData } from '@/features/assignments/model';
import type { AbsenceData } from '@/features/absence/absence-utils';
import { mondayOf } from '@/features/schedule/week';
import { absenceStat, assignmentStats, fmtNumber, lessonStats } from './stats';
import { useYearLessons } from './useYearLessons';
import { saveSummaryImage, type ImageTile } from './image';

const readAssignmentsTyped = readAssignments as (doc: Document) => AssignmentsData;
const readAbsenceTyped = readAbsence as (doc: Document) => AbsenceData;

const monthYear = (d: Date) => d.toLocaleDateString('da-DK', { month: 'short', year: 'numeric' });
const plural = (n: number, one: string, many: string) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

export default function WrappedPage() {
  const school = useSchoolId();
  const now = useMemo(() => new Date(), []);
  const term = useTermOptions();
  const account = useAccount();
  const year = term?.year ?? schoolYearOf(now);
  const ready = account.isSuccess || account.isError;
  const owner = account.data?.data.elevId ?? null;

  const schedule = useYearLessons(year, owner, ready, now);
  const assignments = useLectioPage(PATHS.assignments, readAssignmentsTyped);
  const absence = useLectioPage(PATHS.absence, readAbsenceTyped);

  const lessons = useMemo(() => (schedule.lessons ? lessonStats(schedule.lessons, now) : null), [schedule.lessons, now]);
  const tasks = useMemo(() => (assignments.data ? assignmentStats(assignments.data.data.assignments, year) : null), [assignments.data, year]);
  const away = useMemo(() => (absence.data ? absenceStat(absence.data.data) : null), [absence.data]);

  const total = schedule.weeks.length;
  const first = schedule.weeks[0] ? mondayOf(schedule.weeks[0]) : now;
  const last = new Date(Math.min(now.getTime(), new Date(year + 1, 6, 31).getTime()));
  const period = `${monthYear(first)} – ${monthYear(last)}`;

  const tiles: ImageTile[] | null =
    lessons && (lessons.held > 0 || lessons.cancelled > 0)
      ? [
          { value: fmtNumber(lessons.held), label: 'moduler afholdt' },
          { value: fmtNumber(lessons.hours), label: 'timer i undervisning' },
          { value: fmtNumber(lessons.cancelled), label: 'aflyste moduler' },
          ...(lessons.busiestWeek ? [{ value: `Uge ${lessons.busiestWeek.week}`, label: `travleste uge (${lessons.busiestWeek.count} moduler)` }] : []),
          ...(lessons.topSubject ? [{ value: lessons.topSubject.subject, label: 'mest på skemaet' }] : []),
          ...(tasks && tasks.total > 0 ? [{ value: fmtNumber(tasks.delivered), label: `afleveringer · ${fmtNumber(tasks.hours)} elevtimer` }] : []),
        ]
      : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Lectio Wrapped"
        title={`Dit skoleår ${termLabel(year)} i tal`}
        description={`Fra skemaet, opgaverne og fraværet · ${period}`}
        actions={tiles && <SaveImage year={termLabel(year)} period={period} tiles={tiles} />}
      />

      {schedule.failed > 0 ? (
        <Card>
          <ErrorState error={schedule.error} onRetry={schedule.retry} href={pageUrl(school, PATHS.schedule)} />
          <p className="-mt-4 pb-6 text-center text-[12.5px] text-fg-subtle">{plural(schedule.failed, 'uge', 'uger')} af skemaet kunne ikke hentes, så tallene vises ikke endnu.</p>
        </Card>
      ) : !lessons ? (
        <Progress done={schedule.done} total={total} />
      ) : lessons.held === 0 && lessons.cancelled === 0 ? (
        <Card>
          <EmptyState icon={<CalendarRange />} title="Ingen moduler endnu" description={`Der er ingen afholdte moduler i ${termLabel(year)} at tælle endnu.`} />
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {lessons && (lessons.held > 0 || lessons.cancelled > 0) && (
          <>
            <Stat hero icon={<Clock />} label="Moduler afholdt" value={fmtNumber(lessons.held)} sub={`Det er ${plural(lessons.hours, 'time', 'timer')} i undervisning.`} />
            <Stat
              icon={<CalendarX2 />}
              label="Aflyste moduler"
              value={fmtNumber(lessons.cancelled)}
              sub={lessons.mostCancelled ? `Mest aflyst: ${lessons.mostCancelled.subject} (${lessons.mostCancelled.count})` : 'Ingen aflysninger – alt blev til noget.'}
            />
            {lessons.busiestWeek && <Stat icon={<CalendarRange />} label="Travleste uge" value={`Uge ${lessons.busiestWeek.week}`} sub={`${plural(lessons.busiestWeek.count, 'modul', 'moduler')} på én uge.`} />}
            {lessons.topSubject && (
              <Stat icon={<BookOpen />} label="Mest på skemaet" value={lessons.topSubject.subject} sub={`${plural(lessons.topSubject.count, 'modul', 'moduler')} · ${plural(lessons.topSubject.hours, 'time', 'timer')}`} />
            )}
            {lessons.topRoom && (
              <Stat
                icon={<DoorOpen />}
                label="Dit stamlokale"
                value={lessons.topRoom.room}
                sub={[plural(lessons.topRoom.count, 'modul', 'moduler'), lessons.topTeacher && `oftest med ${lessons.topTeacher.name}`].filter(Boolean).join(' · ')}
              />
            )}
          </>
        )}
        {assignments.isPending ? (
          <StatSkeleton />
        ) : assignments.error ? (
          <Stat icon={<ClipboardCheck />} label="Afleveringer" value="–" sub="Opgaverne kunne ikke hentes fra Lectio." />
        ) : tasks && tasks.total > 0 ? (
          <Stat icon={<ClipboardCheck />} label="Afleveringer" value={fmtNumber(tasks.delivered)} sub={`${plural(tasks.hours, 'elevtime', 'elevtimer')} afleveret af ${fmtNumber(tasks.total)} opgaver.`} />
        ) : null}
        {absence.isPending ? (
          <StatSkeleton />
        ) : absence.error ? (
          <Stat icon={<UserX />} label="Fravær" value="–" sub="Fraværet kunne ikke hentes fra Lectio." />
        ) : away ? (
          <Stat icon={<UserX />} label="Fravær" value={away.value} sub={away.label || 'Samlet fravær'} />
        ) : null}
      </div>

    </Page>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Card className="p-5" aria-busy="true">
      <p className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
        <LoaderCircle className="size-4 animate-spin text-fg-subtle" /> Henter dit skema …
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Uger hentet">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[12.5px] text-fg-subtle tabular-nums">
        {done} af {total} uger. Færdige uger huskes, så det går hurtigere næste gang.
      </p>
    </Card>
  );
}

function Stat({ icon, label, value, sub, hero }: { icon: ReactNode; label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <Card className={cn('flex flex-col gap-3 p-5', hero && 'border-transparent bg-accent-soft sm:col-span-2')}>
      <p className={cn('flex items-center gap-1.5 text-[12.5px] font-medium [&_svg]:size-3.5', hero ? 'text-accent-soft-fg' : 'text-fg-muted')}>
        {icon} {label}
      </p>
      <p className={cn('truncate leading-none font-bold tracking-[-0.03em] tabular-nums', hero ? 'text-[56px] text-accent-soft-fg' : 'text-[36px] text-fg')}>{value}</p>
      {sub && <p className={cn('text-[13px]', hero ? 'text-accent-soft-fg/85' : 'text-fg-muted')}>{sub}</p>}
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card className="space-y-3 p-5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-9 w-20" />
      <Skeleton className="h-3 w-40" />
    </Card>
  );
}

/** The numbers above as one shareable image (only the student's own numbers, no names). */
function SaveImage({ year, period, tiles }: { year: string; period: string; tiles: ImageTile[] }) {
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const save = async () => {
    setState('saving');
    try {
      await saveSummaryImage({ year, period, tiles });
      setState('idle');
    } catch {
      setState('error');
    }
  };
  return (
    <Button size="sm" variant="secondary" onClick={save} disabled={state === 'saving'} title="Billedet viser kun dine egne tal – ingen navne på andre.">
      {state === 'saving' ? <LoaderCircle className="animate-spin" /> : <Download />} {state === 'error' ? 'Prøv igen' : 'Gem som billede'}
    </Button>
  );
}
