import type { CSSProperties } from 'react';
import { BookOpen, StickyNote } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtTime } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { hourRange, layoutDay, splitPerson, type Lesson } from './lessons';
import { LessonHover, LessonLink } from './LessonLink';
import { dayKey, WEEKDAYS_SHORT } from './week';

const HOUR_PX = 68;
const PX_PER_MIN = HOUR_PX / 60;
const AXIS_W = 60;
const pad = (n: number) => String(n).padStart(2, '0');

export interface Day {
  date: Date;
  index: number; // 0 = Monday
  lessons: Lesson[];
}

function DayHeader({ day, today }: { day: Day; today: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5 border-l border-border py-2.5', today && 'text-accent-soft-fg')}>
      <span className={cn('text-[11.5px] font-medium tracking-wide uppercase', today ? 'text-accent' : 'text-fg-subtle')}>{WEEKDAYS_SHORT[day.index]}</span>
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-full text-[17px] font-semibold tabular-nums tracking-[-0.02em]',
          today ? 'bg-accent text-accent-fg shadow-sm' : 'text-fg',
        )}
      >
        {day.date.getDate()}
      </span>
    </div>
  );
}

function LessonBlock({ lesson, col, cols, from }: { lesson: Lesson; col: number; cols: number; from: number }) {
  const c = subjectColor(lesson.hold);
  const top = (lesson.startMin - from * 60) * PX_PER_MIN;
  const height = Math.max(22, (lesson.endMin - lesson.startMin) * PX_PER_MIN - 3);
  const cancelled = lesson.status === 'cancelled';
  const changed = lesson.status === 'changed';
  const size = height >= 76 ? 'lg' : height >= 44 ? 'md' : 'sm';
  const room = lesson.rooms.join(', ');
  const teacher = lesson.teachers.map((t) => splitPerson(t).code).join(', ');
  const style: CSSProperties = {
    top,
    height,
    left: `calc(${(col / cols) * 100}% + 3px)`,
    width: `calc(${100 / cols}% - ${cols > 1 ? 4 : 6}px)`,
    backgroundColor: c.bg,
    color: c.fg,
    ...(cancelled && {
      backgroundImage: `repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in oklch, ${c.bar} 16%, transparent) 7px 14px)`,
    }),
  };
  const icons = (lesson.hasHomework || lesson.hasNote || changed || cancelled) && (
    <span className="flex shrink-0 items-center gap-1">
      {lesson.hasHomework && <BookOpen aria-label="Lektier" className="size-3.5 opacity-80" />}
      {lesson.hasNote && <StickyNote aria-label="Note" className="size-3.5 opacity-80" />}
      {changed && size !== 'sm' && <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">Ændret</span>}
      {cancelled && size !== 'sm' && <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 font-semibold text-white">Aflyst</span>}
    </span>
  );
  return (
    <LessonHover lesson={lesson}>
      <LessonLink
        lesson={lesson}
        style={style}
        className={cn(
          'group absolute flex flex-col overflow-hidden rounded-[9px] py-1.5 pr-1.5 pl-2.5 text-left shadow-card transition-[box-shadow,transform,opacity] duration-150 hover:z-20 hover:-translate-y-px hover:shadow-pop focus-visible:z-20',
          changed && 'ring-2 ring-accent ring-offset-1 ring-offset-surface',
          cancelled && 'opacity-60 hover:opacity-90',
          size === 'sm' && 'justify-center py-0',
        )}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c.bar }} />
        <span className="flex min-w-0 items-start gap-1">
          <span className={cn('min-w-0 flex-1 truncate text-[12.5px] leading-[1.35] font-semibold', cancelled && 'line-through decoration-1')}>
            {lesson.subject}
            {size === 'sm' && room && <span className="font-normal opacity-75"> · {room}</span>}
          </span>
          {icons}
        </span>
        {size === 'lg' && lesson.title && <span className={cn('truncate text-[12px] leading-[1.35] opacity-90', cancelled && 'line-through')}>{lesson.title}</span>}
        {size !== 'sm' && (
          <span className="mt-auto flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11.5px] leading-[1.35] opacity-75">
            <span className="tabular-nums">
              {fmtTime(lesson.startDate)}
              {size === 'lg' && `–${fmtTime(lesson.endDate)}`}
            </span>
            {room && <span className="truncate font-medium">{room}</span>}
            {size === 'lg' && teacher && <span className="truncate">{teacher}</span>}
          </span>
        )}
      </LessonLink>
    </LessonHover>
  );
}

function NowLine({ now, from, to, label }: { now: Date; from: number; to: number; label?: boolean }) {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < from * 60 || mins > to * 60) return null;
  const top = (mins - from * 60) * PX_PER_MIN;
  if (label) {
    return (
      <span className="absolute right-1.5 z-10 -translate-y-1/2 rounded-full bg-accent px-1.5 text-[10.5px] leading-[18px] font-semibold text-accent-fg tabular-nums shadow-sm" style={{ top }}>
        {fmtTime(now)}
      </span>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-30" style={{ top }}>
      <div className="h-[2px] -translate-y-1/2 bg-accent" />
      <div className="absolute -top-[5px] -left-[5px] size-[10px] rounded-full bg-accent ring-2 ring-surface" />
    </div>
  );
}

function Grid({ days, from, to, children, header }: { days: number; from: number; to: number; header: React.ReactNode; children: React.ReactNode }) {
  const cols = { gridTemplateColumns: `${AXIS_W}px repeat(${days}, minmax(0, 1fr))` };
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <Card className="relative">
      <div className="sticky top-0 z-40 grid rounded-t-xl border-b border-border bg-surface/90 backdrop-blur-md" style={cols}>
        <div />
        {header}
      </div>
      <div className="relative grid pt-3 pb-4" style={cols}>
        {/* hour lines spanning all day columns */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-3" style={{ left: AXIS_W }}>
          {hours.map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-border" style={{ top: (h - from) * HOUR_PX }} />
          ))}
          {hours.slice(0, -1).map((h) => (
            <div key={`${h}h`} className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: (h - from + 0.5) * HOUR_PX }} />
          ))}
        </div>
        <div className="relative" style={{ height: (to - from) * HOUR_PX }}>
          {hours.map((h) => (
            <span key={h} className="absolute right-2.5 -translate-y-1/2 text-[11px] font-medium text-fg-subtle tabular-nums" style={{ top: (h - from) * HOUR_PX }}>
              {pad(h)}:00
            </span>
          ))}
        </div>
        {children}
      </div>
    </Card>
  );
}

export function WeekGrid({ days, now }: { days: Day[]; now: Date }) {
  const all = days.flatMap((d) => d.lessons);
  const [from, to] = hourRange(all);
  const todayKey = dayKey(now);
  const todayIndex = days.findIndex((d) => dayKey(d.date) === todayKey);
  return (
    <Grid
      days={days.length}
      from={from}
      to={to}
      header={days.map((d) => (
        <DayHeader key={d.index} day={d} today={dayKey(d.date) === todayKey} />
      ))}
    >
      {todayIndex >= 0 && (
        <div className="pointer-events-none absolute top-3 left-0" style={{ width: AXIS_W, height: (to - from) * HOUR_PX }}>
          <NowLine now={now} from={from} to={to} label />
        </div>
      )}
      {days.map((d, i) => {
        const isToday = i === todayIndex;
        const past = dayKey(d.date) < todayKey;
        return (
          <div key={d.index} className={cn('relative border-l border-border', isToday && 'bg-accent-soft/25', past && 'bg-surface-2/40')} style={{ height: (to - from) * HOUR_PX }}>
            {layoutDay(d.lessons).map(({ item, col, cols }) => (
              <LessonBlock key={item.id} lesson={item} col={col} cols={cols} from={from} />
            ))}
            {isToday && <NowLine now={now} from={from} to={to} />}
          </div>
        );
      })}
    </Grid>
  );
}

// Plausible-looking placeholder blocks while a week loads.
const GHOSTS = [
  [0, 15, 90], [0, 120, 90], [0, 300, 90],
  [1, 15, 90], [1, 210, 90],
  [2, 120, 90], [2, 245, 90], [2, 360, 60],
  [3, 15, 90], [3, 120, 90],
  [4, 15, 90], [4, 210, 90],
];

export function WeekGridSkeleton() {
  const from = 8;
  const to = 16;
  return (
    <div aria-busy="true" aria-label="Indlæser skema">
      <Grid
        days={5}
        from={from}
        to={to}
        header={Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 border-l border-border py-2.5">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="size-7 rounded-full" />
          </div>
        ))}
      >
        {Array.from({ length: 5 }, (_, day) => (
          <div key={day} className="relative border-l border-border">
            {GHOSTS.filter(([d]) => d === day).map(([, start, len]) => (
              <div key={start} className="absolute inset-x-[3px]" style={{ top: start * PX_PER_MIN, height: len * PX_PER_MIN - 3 }}>
                <Skeleton className="size-full rounded-[9px]" />
              </div>
            ))}
          </div>
        ))}
      </Grid>
    </div>
  );
}
