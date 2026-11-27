import { Fragment } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, BookOpen, CalendarDays, StickyNote, Users } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { dayDiff, fmtTime } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { SmartLink } from './SmartLink';
import { lessonName, type Day, type Lesson } from './model';
import { People } from '@/features/people/PersonPopover';
import { Rooms } from '@/features/rooms/RoomPopover';

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

function dayTitle(day: Day, now: Date) {
  const start = day.lessons.find((l) => l.time)?.time?.start;
  const diff = start ? dayDiff(start, now) : null;
  const rel = diff === 0 ? 'I dag' : diff === 1 ? 'I morgen' : null;
  return { title: rel || day.label || 'Skema', sub: rel ? day.label : '' };
}

function NowLine({ now }: { now: Date }) {
  return (
    <li aria-label={`Nu ${fmtTime(now)}`} className="relative flex items-center gap-2 py-1 pl-[66px] pr-2">
      <span className="absolute left-[57px] size-2 rounded-full bg-accent ring-4 ring-accent-soft" />
      <span className="h-px flex-1 bg-accent/60" />
      <span className="text-[11px] font-semibold text-accent tabular-nums">{fmtTime(now)}</span>
    </li>
  );
}

function LessonRow({ lesson, now }: { lesson: Lesson; now: Date }) {
  const color = subjectColor(lesson.holds[0] || lesson.title);
  const t = lesson.time;
  const past = !!t && t.end <= now;
  const live = !!t && t.start <= now && now < t.end;
  const cancelled = lesson.status === 'cancelled';
  const holds = lesson.holds.join(', ');
  return (
    <li>
      <SmartLink
        href={lesson.href}
        className={cn(
          'group relative flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2',
          live && 'bg-surface-2 ring-1 ring-border',
          (past || cancelled) && 'opacity-55 hover:opacity-100',
        )}
      >
        <div className="w-10 shrink-0 pt-px text-right tabular-nums">
          <div className={cn('text-[13px] font-medium', live ? 'text-fg' : 'text-fg-muted')}>{t ? fmtTime(t.start) : lesson.module.replace(/\.?\s*modul/i, '.')}</div>
          {t && <div className="text-[11.5px] text-fg-subtle">{fmtTime(t.end)}</div>}
        </div>
        <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ background: color.bar }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('truncate text-[13.5px] font-medium text-fg', cancelled && 'line-through')}>{lessonName(lesson)}</span>
            {lesson.homework && <BookOpen aria-label="Lektier" className="size-3.5 shrink-0 text-info" />}
            {lesson.note && <StickyNote aria-label="Note" className="size-3.5 shrink-0 text-fg-subtle" />}
          </div>
          {(holds || lesson.room || lesson.teachers.length > 0) && (
            <div className="truncate text-[12px] text-fg-muted">
              {[
                holds && <Fragment key="h">{holds}</Fragment>,
                lesson.room && <Rooms key="r" rooms={lesson.room} day={t?.start} />,
                lesson.teachers.length > 0 && <People key="t" names={lesson.teachers} kind="laerer" />,
              ]
                .filter(Boolean)
                .map((part, i) => (
                  <Fragment key={i}>
                    {i > 0 && ' · '}
                    {part}
                  </Fragment>
                ))}
            </div>
          )}
          {(live || lesson.status !== 'normal') && (
            <div className="mt-1 flex gap-1">
              {live && <Badge tone="accent">Nu</Badge>}
              {lesson.status === 'changed' && <Badge tone="warning">Ændret</Badge>}
              {cancelled && <Badge tone="danger">Aflyst</Badge>}
            </div>
          )}
        </div>
      </SmartLink>
    </li>
  );
}

function DayList({ day, now }: { day: Day; now: Date }) {
  const isToday = day.lessons.some((l) => l.time && dayDiff(l.time.start, now) === 0);
  const nowAt = isToday
    ? day.lessons.findIndex((l) => l.time && l.time.start > now)
    : -1;
  const inLesson = day.lessons.some((l) => l.time && l.time.start <= now && now < l.time.end);
  const lastEnd = day.lessons.at(-1)?.time?.end;
  const showEndLine = isToday && nowAt === -1 && !inLesson && !!lastEnd && lastEnd <= now;
  return (
    <ol className="space-y-0.5">
      {day.lessons.map((l, i) => (
        <Fragment key={i}>
          {isToday && !inLesson && i === nowAt && <NowLine now={now} />}
          <LessonRow lesson={l} now={now} />
        </Fragment>
      ))}
      {showEndLine && <NowLine now={now} />}
    </ol>
  );
}

export function Timeline({ days, focus, now, groups }: { days: Day[]; focus: number; now: Date; groups: Array<{ label: string; href: string }> }) {
  const day = days[focus];
  const rest = days.filter((_, i) => i > focus);
  const head = day ? dayTitle(day, now) : { title: 'I dag', sub: '' };
  return (
    <Card>
      <CardHeader
        icon={<CalendarDays />}
        title={head.title}
        description={head.sub ? capital(head.sub) : undefined}
        action={
          <Link to="/schedule" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
            Skema <ArrowUpRight className="size-3.5" />
          </Link>
        }
      />
      <CardBody className="px-3 pb-3">
        {day?.lessons.length ? <DayList day={day} now={now} /> : <EmptyState className="py-6" title="Ingen lektioner" description="Der er ingen lektioner på forsiden." />}
        {rest.map((d, i) => d.lessons.length > 0 && (
          <div key={i} className="mt-3 border-t border-border pt-3">
            <div className="mb-1 px-2 text-[12px] font-semibold tracking-wide text-fg-subtle uppercase">{dayTitle(d, now).title}{dayTitle(d, now).sub && <span className="font-normal normal-case"> · {dayTitle(d, now).sub}</span>}</div>
            <DayList day={d} now={now} />
          </div>
        ))}
        {groups.length > 0 && (
          <div className="mt-3 border-t border-border px-2 pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-fg-subtle uppercase"><Users className="size-3.5" /> Hold og grupper</div>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const c = subjectColor(g.label);
                return (
                  <SmartLink key={g.href} href={g.href} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg">
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: c.bar }} />
                    {g.label}
                  </SmartLink>
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
