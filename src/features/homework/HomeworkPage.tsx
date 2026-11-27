import { useMemo } from 'react';
import { BookOpen, ChevronRight, Clock, ExternalLink, MapPin, StickyNote, UserRound } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { readHomework } from '@/lib/lectio/readers/homework.js';
import { readActivity } from '@/lib/lectio/readers/activity.js';
import { dayDiff, fmtLongDate, fmtTime } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { SmartLink } from '@/features/home/SmartLink';
import { absidFromHref, activityPath, type ActivityData } from '@/features/lesson/lesson-utils';
import { detailSections } from '@/features/schedule/lessons';
import { People } from '@/features/people/PersonPopover';
import { Rooms } from '@/features/rooms/RoomPopover';
import { groupByDay, type HomeworkData, type HomeworkDay, type HomeworkRow } from './model';

const read = readHomework as (doc: Document) => HomeworkData;

export default function HomeworkPage() {
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.homework, read);
  const lectioUrl = pageUrl(school, PATHS.homework);
  const rows = loaded?.data.rows;
  const days = useMemo(() => groupByDay(rows ?? []), [rows]);
  const now = new Date();

  return (
    <Page>
      <PageHeader
        title="Lektier"
        description={rows ? (rows.length ? `${rows.length} ${rows.length === 1 ? 'modul' : 'moduler'} med lektier forude` : 'Ingen lektier lige nu') : 'Lektier til de kommende moduler'}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a href={lectioUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        }
      />
      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : days.length ? (
        <div className="space-y-7">
          {days.map((day) => (
            <DaySection key={day.key} day={day} now={now} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<BookOpen />} title="Ingen lektier" description="Når en lærer lægger lektier på et kommende modul, dukker de op her." />
        </Card>
      )}
    </Page>
  );
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('da') + s.slice(1);

function DaySection({ day, now }: { day: HomeworkDay; now: Date }) {
  const diff = day.date ? dayDiff(day.date, now) : null;
  const when = diff === null ? '' : diff === 0 ? 'I dag' : diff === 1 ? 'I morgen' : diff > 1 ? `Om ${diff} dage` : '';
  return (
    <section className="animate-in">
      <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-fg">
        {day.date ? capitalize(fmtLongDate(day.date)) : 'Uden dato'}
        {when && <span className={cn('font-normal', diff! <= 1 ? 'text-warning-soft-fg' : 'text-fg-subtle')}>{when}</span>}
      </h2>
      <div className="space-y-3">
        {day.rows.map((row, i) => (
          <LessonCard key={(row.lesson.href || '') + i} row={row} />
        ))}
      </div>
    </section>
  );
}

function LessonCard({ row }: { row: HomeworkRow }) {
  const { lesson, start, end } = row;
  const absid = absidFromHref(lesson.href);
  const color = subjectColor(lesson.holds[0] || lesson.title || '');
  const title = lesson.title || lesson.holds.join(', ') || 'Modul';
  // Fællesarrangementer list every class; the title says enough there.
  const holds = lesson.holds.length <= 2 ? lesson.holds : [];
  const time = start && end ? `${fmtTime(start)}–${fmtTime(end)}` : '';
  const cancelled = lesson.status === 'cancelled';

  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color.bar }} />
      <div className="flex items-start gap-3 pt-4 pr-3 pl-6 sm:pr-4 sm:pl-7">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {holds.map((h) => (
              <span key={h} className="inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-semibold text-fg" style={{ background: `color-mix(in oklch, ${color.bar} 20%, transparent)` }}>{h}</span>
            ))}
            <h3 className={cn('min-w-0 text-[15px] font-semibold tracking-[-0.01em] text-fg', cancelled && 'line-through decoration-danger/60')}>
              <SmartLink href={lesson.href} className="hover:text-accent-soft-fg">{title}</SmartLink>
            </h3>
            {cancelled && <Badge tone="danger">Aflyst</Badge>}
            {lesson.status === 'changed' && <Badge tone="warning">Ændret</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-fg-muted">
            {(time || lesson.module) && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="size-3.5 text-fg-subtle" /> {[time, lesson.module].filter(Boolean).join(' · ')}
              </span>
            )}
            {lesson.room && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-fg-subtle" /> <Rooms rooms={lesson.room} day={start} />
              </span>
            )}
            {lesson.teachers.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-3.5 text-fg-subtle" /> <People names={lesson.teachers} kind="laerer" />
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild className="shrink-0 text-fg-muted">
          <SmartLink href={lesson.href}>
            <span className="hidden sm:inline">Åbn modul</span> <ChevronRight />
          </SmartLink>
        </Button>
      </div>
      <HomeworkBody row={row} absid={absid} />
    </Card>
  );
}

/** The overview only has each item's heading; the full text comes from the lesson's own page. */
function HomeworkBody({ row, absid }: { row: HomeworkRow; absid: string | null }) {
  const query = useLectioPage(absid ? activityPath(absid) : null, readActivity);
  const activity = (query.data as Loaded<ActivityData> | undefined)?.data;
  const blocks = activity?.sections.filter((s) => /lekti/i.test(s.title)).flatMap((s) => s.items) ?? [];
  const note = activity?.note || row.note || detailSections(row.details).note;

  return (
    <div className="pt-2 pr-4 pb-4 pl-6 sm:pr-5 sm:pl-7">
      {blocks.length ? (
        <div className="divide-y divide-border">
          {blocks.map((item) => (
            <article key={item.id} className="py-2 first:pt-0 last:pb-0 [&_.prose-lectio>*:first-child]:mt-0 [&_.prose-lectio>*:last-child]:mb-0 [&_.prose-lectio>h1:first-child]:text-[15px]">
              <RichText node={item.node} />
            </article>
          ))}
        </div>
      ) : row.items.length ? (
        <ul className="space-y-1.5" aria-busy={query.isFetching}>
          {row.items.map((item, i) => (
            <li key={item.href + i} className="flex gap-2 text-[14.5px] text-fg">
              <BookOpen className="mt-[3px] size-4 shrink-0 text-accent" /> <span className="min-w-0 break-words">{item.title}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {note && (
        <aside className={cn('flex gap-2.5 rounded-lg bg-warning-soft/60 px-3 py-2', (blocks.length > 0 || row.items.length > 0) && 'mt-3')}>
          <StickyNote className="mt-0.5 size-4 shrink-0 text-warning-soft-fg" />
          <p className="min-w-0 text-[13.5px] whitespace-pre-line text-fg">{note}</p>
        </aside>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Indlæser lektier">
      <Skeleton className="h-4 w-44" />
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} className="space-y-3 py-4 pr-5 pl-7">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </Card>
      ))}
    </div>
  );
}
