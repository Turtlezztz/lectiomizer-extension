import { Link } from 'react-router';
import { ArrowRight, BookOpen, CalendarDays, Clock, MapPin, StickyNote, User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dayDiff, fmtTime, relativeDay } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { SmartLink } from './SmartLink';
import { durationText, lessonName, type FlatLesson } from './model';
import { People } from '@/features/people/PersonPopover';
import { Rooms } from '@/features/rooms/RoomPopover';

export function NowCard({ current, now }: { current: { lesson: FlatLesson; running: boolean } | null; now: Date }) {
  if (!current) return <NoLessons />;
  const { lesson, running } = current;
  const t = lesson.time!;
  const color = subjectColor(lesson.holds[0] || lesson.title);
  const total = t.end.getTime() - t.start.getTime();
  const elapsed = Math.min(total, Math.max(0, now.getTime() - t.start.getTime()));
  const progress = running ? elapsed / total : 0;
  const sameDay = dayDiff(t.start, now) === 0;
  const name = lessonName(lesson);
  const sub = [lesson.title && lesson.holds.join(', '), !lesson.title && lesson.holds[0] !== name && lesson.holds.join(', '), lesson.module].filter(Boolean).join(' · ');

  const countdown = running
    ? { value: durationText(t.end.getTime() - now.getTime()), label: 'tilbage' }
    : sameDay
      ? { value: durationText(t.start.getTime() - now.getTime()), label: 'til start' }
      : { value: relativeDay(t.start, now).replace(/^./, (c) => c.toUpperCase()), label: `kl. ${fmtTime(t.start)}` };

  return (
    <Card className="relative overflow-hidden" aria-label={running ? 'Lektion i gang' : 'Næste lektion'}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-90" style={{ background: `radial-gradient(120% 140% at 0% 0%, ${color.bg} 0%, transparent 62%)` }} />
      <div aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color.bar }} />
      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {running ? (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-surface px-2.5 text-[12px] font-semibold text-fg ring-1 ring-border">
                  <span className="relative flex size-2">
                    <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color.bar }} />
                    <span className="relative size-2 rounded-full" style={{ background: color.bar }} />
                  </span>
                  I gang nu
                </span>
              ) : (
                <span className="inline-flex h-6 items-center rounded-full bg-surface px-2.5 text-[12px] font-semibold text-fg-muted ring-1 ring-border">
                  {sameDay ? 'Næste lektion' : `Næste lektion · ${lesson.dayLabel || relativeDay(t.start, now)}`}
                </span>
              )}
              {lesson.status === 'changed' && <Badge tone="warning">Ændret</Badge>}
              {lesson.homework && <Badge tone="info"><BookOpen /> Lektier</Badge>}
              {lesson.note && <Badge tone="neutral"><StickyNote /> Note</Badge>}
            </div>
            <h2 className="truncate text-[26px] leading-tight font-semibold tracking-[-0.025em] text-fg sm:text-[30px]">{name}</h2>
            {sub && <p className="mt-0.5 truncate text-[13.5px] text-fg-muted">{sub}</p>}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[22px] leading-none font-semibold tracking-[-0.02em] text-fg tabular-nums sm:text-[26px]">{countdown.value}</div>
            <div className="mt-1 text-[12.5px] text-fg-muted">{countdown.label}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5 tabular-nums"><Clock className="size-4 text-fg-subtle" />{fmtTime(t.start)}–{fmtTime(t.end)}</span>
          {lesson.room && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-fg-subtle" /><span><Rooms rooms={lesson.room} day={t.start} /></span></span>}
          {lesson.teachers.length > 0 && <span className="inline-flex items-center gap-1.5"><User className="size-4 text-fg-subtle" /><span><People names={lesson.teachers} kind="laerer" /></span></span>}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            {running ? (
              <>
                <div
                  className="h-2 overflow-hidden rounded-full bg-surface-3"
                  role="progressbar"
                  aria-label="Tid gået af lektionen"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, progress * 100)}%`, background: color.bar }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[12px] text-fg-subtle tabular-nums">
                  <span>{durationText(elapsed)} gået</span>
                  <span>slutter {fmtTime(t.end)}</span>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-fg-muted">
                Starter {sameDay ? 'kl.' : `${relativeDay(t.start, now)} kl.`} <span className="font-medium text-fg tabular-nums">{fmtTime(t.start)}</span>
                {lesson.room && <> i <span className="font-medium text-fg"><Rooms rooms={lesson.room} day={t.start} /></span></>}
              </p>
            )}
          </div>
          {lesson.href && (
            <Button asChild variant="secondary" size="md" className="self-start sm:self-auto">
              <SmartLink href={lesson.href}>Åbn lektion <ArrowRight /></SmartLink>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function NoLessons() {
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 140% at 0% 0%, var(--color-accent-soft) 0%, transparent 60%)' }} />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface text-accent shadow-card ring-1 ring-border">
          <CalendarDays className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-fg">Ikke flere lektioner lige nu</h2>
          <p className="mt-0.5 text-[13.5px] text-fg-muted">Forsiden viser ingen kommende lektioner. Tjek skemaet for resten af ugen.</p>
        </div>
        <Button asChild variant="secondary" className={cn('self-start sm:self-auto')}>
          <Link to="/schedule">Se skema <ArrowRight /></Link>
        </Button>
      </div>
    </Card>
  );
}
