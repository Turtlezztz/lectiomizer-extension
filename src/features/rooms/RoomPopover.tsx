// Click a room ("A12") anywhere in the app: is it free right now, and what is
// booked there that day, with the free time in between. Arrows step the day.
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, DoorOpen, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { appRoute, pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { dayDiff, fmtLongDate, fmtTime, relativeDay } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { useNow } from '@/features/schedule/hooks';
import { useWeekLessons } from '@/features/schedule/week-lessons';
import { lessonsOnDay } from '@/features/schedule/occupancy';
import { DayStrip, durationText } from '@/features/schedule/DayStrip';
import { splitPerson } from '@/features/schedule/lessons';
import { loadDirectory, schedulePath } from '@/features/people/directory';
import { nowStatus } from '@/features/people/person';
import { CardPopover } from '@/features/people/CardPopover';
import { dayPlan, findRoom } from './room';

/** A clickable room name. `day` opens the card on that day (e.g. the lesson's), else today. */
export function Room({ room, day, className, children }: { room: string; day?: Date | null; className?: string; children?: ReactNode }) {
  return (
    <CardPopover label={`lokale ${room}`} className={className} trigger={children ?? room}>
      {(close) => <RoomCard room={room} day={day ?? null} onNavigate={close} />}
    </CardPopover>
  );
}

/** "A12, B21" as separate clickable rooms. */
export function Rooms({ rooms, day, className }: { rooms: string[] | string; day?: Date | null; className?: string }) {
  const list = (Array.isArray(rooms) ? rooms : rooms.split(/\s*,\s*/)).filter(Boolean);
  return (
    <>
      {list.map((r, i) => (
        <Fragment key={r + i}>
          {i > 0 && ', '}
          <Room room={r} day={day} className={className} />
        </Fragment>
      ))}
    </>
  );
}

function useRoomEntry(room: string) {
  const school = useSchoolId();
  const directory = useQuery({
    queryKey: ['lectio-directory', school, 'lokale'],
    queryFn: () => loadDirectory(school, 'lokale'),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return { entry: directory.data ? findRoom(directory.data, room) : undefined, isPending: directory.isPending };
}

const addDays = (d: Date, n: number) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

function RoomCard({ room, day: initialDay, onNavigate }: { room: string; day: Date | null; onNavigate: () => void }) {
  const school = useSchoolId();
  const now = useNow();
  const [offset, setOffset] = useState(() => (initialDay ? dayDiff(initialDay, now) : 0));
  const day = offset === 0 ? now : addDays(now, offset);
  const isToday = offset === 0;
  const { entry, isPending } = useRoomEntry(room);
  const base = entry ? schedulePath('lokale', entry.id) : null;
  const week = useWeekLessons(base, day);
  const label = entry?.label || room;
  const [code, ...rest] = label.split(' ');
  const description = entry && fold1(code) === fold1(room) ? rest.join(' ') : entry && label !== room ? label : '';

  return (
    <div>
      <div className="flex items-center gap-3 p-4 pb-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
          <DoorOpen className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-fg-subtle">Lokale</div>
          <h3 className="truncate text-[17px] leading-snug font-semibold tracking-[-0.015em] text-fg">{entry && description ? code : room}</h3>
          {description && <p className="truncate text-[12.5px] text-fg-muted">{description}</p>}
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        {isPending ? (
          <Skeleton className="h-[68px] w-full rounded-xl" />
        ) : !entry ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-fg-muted">Lokalet {room} er ikke på Lectios lokaleliste, så dets skema kan ikke ses.</p>
        ) : week.isPending ? (
          <Skeleton className="h-[120px] w-full rounded-xl" />
        ) : week.error || !week.data ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-fg-muted">Lokalets skema kunne ikke hentes fra Lectio.</p>
        ) : (
          <>
            {isToday && <StatusBox lessons={week.data} now={now} />}
            <DayBookings lessons={lessonsOnDay(week.data, day)} day={day} now={now} isToday={isToday} offset={offset} setOffset={setOffset} onNavigate={onNavigate} />
          </>
        )}
      </div>

      {entry && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-2/50 px-3 py-2.5">
          <Button size="sm" variant="secondary" asChild>
            <Link to={`/rooms/${encodeURIComponent(entry.id)}`} onClick={onNavigate}>
              <CalendarDays /> Lokalets skema
            </Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/rooms" onClick={onNavigate}>
              <DoorOpen /> Ledige lokaler
            </Link>
          </Button>
          <Button size="icon-sm" variant="ghost" asChild className="ml-auto">
            <a href={pageUrl(school, schedulePath('lokale', entry.id))} target="_blank" rel="noreferrer" aria-label="Åbn i Lectio" title="Åbn i Lectio">
              <ExternalLink />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

const fold1 = (s: string) => s.toLocaleLowerCase('da').trim();

function StatusBox({ lessons, now }: { lessons: Parameters<typeof nowStatus>[0]; now: Date }) {
  const s = nowStatus(lessons, now, 'lokale');
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', s.busy ? 'border-danger/25 bg-danger-soft/60' : 'border-success/25 bg-success-soft/60')}>
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
        <CalendarClock className={cn('size-4 shrink-0', s.busy ? 'text-danger' : 'text-success')} />
        {s.busy ? s.title : s.title.replace(/^Ledig i /, 'Ledig nu · i ')}
      </div>
      {s.sub && <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">{s.sub}</div>}
      <DayStrip lessons={s.today} at={now} className="mt-2" />
    </div>
  );
}

function DayBookings({
  lessons,
  day,
  now,
  isToday,
  offset,
  setOffset,
  onNavigate,
}: {
  lessons: ReturnType<typeof lessonsOnDay>;
  day: Date;
  now: Date;
  isToday: boolean;
  offset: number;
  setOffset: (fn: (o: number) => number) => void;
  onNavigate: () => void;
}) {
  const plan = dayPlan(lessons);
  const rel = relativeDay(day, now);
  const heading = /^i (dag|morgen|går)$/.test(rel) ? `${rel[0].toUpperCase()}${rel.slice(1)} · ${fmtLongDate(day)}` : fmtLongDate(day);
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-1">
        <h4 className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg-subtle first-letter:uppercase">{heading}</h4>
        <Button size="icon-sm" variant="ghost" aria-label="Dagen før" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft />
        </Button>
        {offset !== 0 && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setOffset(() => 0)}>
            I dag
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label="Dagen efter" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight />
        </Button>
      </div>
      {!isToday && <DayStrip lessons={lessons} at={day} className="mb-2 [&>span[aria-hidden]]:hidden" />}
      {plan.length ? (
        <ol className="max-h-64 space-y-0.5 overflow-y-auto">
          {plan.map((item, i) =>
            item.type === 'free' ? (
              <li key={`f${i}`} className="flex items-center gap-2 px-2 py-0.5 text-[12px] text-success">
                <span className="w-[78px] shrink-0 tabular-nums">
                  {fmtTime(item.from)}–{fmtTime(item.to)}
                </span>
                Ledig i {durationText(Math.round((item.to.getTime() - item.from.getTime()) / 60_000))}
              </li>
            ) : (
              <Booking key={item.lesson.id + i} lesson={item.lesson} now={now} onNavigate={onNavigate} />
            ),
          )}
        </ol>
      ) : (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted">Ingen bookinger – lokalet er ledigt hele dagen.</p>
      )}
    </section>
  );
}

function Booking({ lesson, now, onNavigate }: { lesson: ReturnType<typeof lessonsOnDay>[number]; now: Date; onNavigate: () => void }) {
  const c = subjectColor(lesson.hold || lesson.title);
  const live = lesson.startDate <= now && now < lesson.endDate;
  const past = lesson.endDate <= now;
  const route = appRoute(lesson.href);
  const teachers = lesson.teachers.map((t) => splitPerson(t).code).join(', ');
  const body = (
    <>
      <span className="w-[78px] shrink-0 text-[12px] text-fg-muted tabular-nums">
        {fmtTime(lesson.startDate)}–{fmtTime(lesson.endDate)}
      </span>
      <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: c.bar }} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{lesson.hold || lesson.title || 'Booket'}</span>
      {teachers && <span className="shrink-0 text-[12px] text-fg-subtle">{teachers}</span>}
    </>
  );
  const cls = cn('flex items-center gap-2 rounded-md px-2 py-1', live && 'bg-danger-soft/60', past && 'opacity-55', route && 'hover:bg-surface-2');
  return (
    <li>
      {route ? (
        <Link to={route} onClick={onNavigate} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
