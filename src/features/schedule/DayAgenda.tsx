import { Fragment } from 'react';
import { BookOpen, CalendarCheck, ChevronRight, MapPin, StickyNote, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtTime } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { splitPerson, type Lesson } from './lessons';
import { LessonLink, StatusBadge } from './LessonLink';
import type { Day } from './WeekGrid';
import { dayKey, WEEKDAYS_LONG, WEEKDAYS_SHORT } from './week';

export function DayPicker({ days, selected, onSelect, now }: { days: Day[]; selected: number; onSelect: (index: number) => void; now: Date }) {
  const todayKey = dayKey(now);
  return (
    <div role="tablist" aria-label="Vælg dag" className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      {days.map((d) => {
        const active = d.index === selected;
        const today = dayKey(d.date) === todayKey;
        const count = d.lessons.filter((l) => l.status !== 'cancelled').length;
        const dots = d.lessons.slice(0, 6);
        return (
          <button
            key={d.index}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(d.index)}
            className={cn(
              'flex min-w-[54px] flex-1 flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors',
              active ? 'border-transparent bg-accent text-accent-fg shadow-sm' : 'border-border bg-surface text-fg shadow-card hover:border-border-strong',
            )}
          >
            <span className={cn('text-[11px] font-medium tracking-wide uppercase', active ? 'text-accent-fg/85' : today ? 'text-accent' : 'text-fg-subtle')}>{WEEKDAYS_SHORT[d.index]}</span>
            <span className="text-[17px] leading-tight font-semibold tabular-nums">{d.date.getDate()}</span>
            <span className="flex h-1.5 items-center gap-0.5" aria-label={`${count} moduler`}>
              {dots.map((l) => (
                <span key={l.id} className={cn('size-1 rounded-full', active ? 'bg-accent-fg/80' : 'bg-fg-subtle/60', l.status === 'cancelled' && 'opacity-40')} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Gap({ minutes }: { minutes: number }) {
  if (minutes < 20) return <div className="h-2" />;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const text = h ? (m ? `${h} t ${m} min` : `${h} t`) : `${m} min`;
  return (
    <div className="flex items-center gap-3 py-1.5 pl-[60px] text-[12px] text-fg-subtle">
      <span className="h-px flex-1 bg-border" />
      {text} fri
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function AgendaItem({ lesson, now }: { lesson: Lesson; now: Date }) {
  const c = subjectColor(lesson.hold);
  const cancelled = lesson.status === 'cancelled';
  const ongoing = !cancelled && lesson.startDate <= now && now < lesson.endDate;
  const past = lesson.endDate <= now;
  const teachers = lesson.teachers.map((t) => splitPerson(t).name).join(', ');
  return (
    <LessonLink
      lesson={lesson}
      className={cn(
        'group flex items-stretch gap-3 rounded-xl border border-border bg-surface p-3 shadow-card transition-colors active:bg-surface-2',
        lesson.status === 'changed' && 'border-accent/60 ring-1 ring-accent/40',
        ongoing && 'ring-2 ring-accent/50',
        (cancelled || past) && 'opacity-60',
      )}
    >
      <div className="w-12 shrink-0 pt-0.5 text-right tabular-nums">
        <div className={cn('text-[13.5px] font-semibold text-fg', cancelled && 'line-through')}>{fmtTime(lesson.startDate)}</div>
        <div className="text-[12px] text-fg-subtle">{fmtTime(lesson.endDate)}</div>
      </div>
      <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ background: c.bar }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-[14.5px] font-semibold text-fg', cancelled && 'line-through decoration-fg-subtle')}>{lesson.name}</p>
          {ongoing && <Badge tone="accent">Nu</Badge>}
          <StatusBadge status={lesson.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-fg-muted">
          {lesson.rooms.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-fg-subtle" />
              {lesson.rooms.join(', ')}
            </span>
          )}
          {teachers && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <User className="size-3.5 shrink-0 text-fg-subtle" />
              <span className="truncate">{teachers}</span>
            </span>
          )}
        </div>
        {(lesson.homeworkText || lesson.noteText || lesson.hasHomework || lesson.hasNote) && (
          <div className="mt-2 space-y-1">
            {(lesson.homeworkText || lesson.hasHomework) && (
              <p className="flex gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[12.5px] text-fg-muted">
                <BookOpen className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
                <span className="line-clamp-2 whitespace-pre-line">{lesson.homeworkText || 'Lektier'}</span>
              </p>
            )}
            {(lesson.noteText || lesson.hasNote) && (
              <p className="flex gap-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[12.5px] text-fg-muted">
                <StickyNote className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
                <span className="line-clamp-2 whitespace-pre-line">{lesson.noteText || 'Note'}</span>
              </p>
            )}
          </div>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 self-center text-fg-subtle opacity-60" />
    </LessonLink>
  );
}

export function DayAgenda({ day, now }: { day: Day; now: Date }) {
  const lessons = day.lessons;
  return (
    <section aria-label={WEEKDAYS_LONG[day.index]}>
      <h2 className="mb-2.5 text-[13px] font-medium text-fg-muted">
        {WEEKDAYS_LONG[day.index]} {day.date.getDate()}. {day.date.toLocaleDateString('da-DK', { month: 'long' })}
        {dayKey(day.date) === dayKey(now) && <span className="text-accent"> · i dag</span>}
      </h2>
      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState icon={<CalendarCheck />} title="Ingen moduler" description="Der er intet på skemaet denne dag." />
        </div>
      ) : (
        <div>
          {lessons.map((l, i) => {
            const prev = lessons[i - 1];
            return (
              <Fragment key={l.id}>
                {prev && <Gap minutes={l.startMin - prev.endMin} />}
                <AgendaItem lesson={l} now={now} />
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AgendaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Indlæser skema">
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[62px] flex-1 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-3.5 w-36" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[76px] rounded-xl" />
      ))}
    </div>
  );
}
