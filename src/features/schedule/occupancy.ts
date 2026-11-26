// Is a room (or person) booked at a given moment? Worked out from the lessons
// of their SkemaNy.aspx week: cancelled lessons don't count, and back-to-back
// lessons (a short break apart) are treated as one busy stretch.
import { dayKey } from './week';
import type { Lesson } from './lessons';

/** Lessons closer than this are one busy stretch (normal breaks between modules). */
export const CHAIN_GAP_MIN = 15;

export type Occupancy =
  | { state: 'busy'; lesson: Lesson; /** When the busy stretch ends. */ freeAt: Date; next: Lesson | null }
  | { state: 'free'; /** Next lesson that day, if any. */ next: Lesson | null; /** Minutes until `next` (null: rest of the day). */ freeFor: number | null };

const active = (lessons: Lesson[], at: Date) =>
  lessons.filter((l) => l.status !== 'cancelled' && l.day === dayKey(at)).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

export function occupancyAt(lessons: Lesson[], at: Date): Occupancy {
  const today = active(lessons, at);
  const t = at.getTime();
  const current = today.filter((l) => l.startDate.getTime() <= t && t < l.endDate.getTime());
  if (current.length) {
    // The lesson that runs the longest decides the end; then follow chained lessons.
    let freeAt = new Date(Math.max(...current.map((l) => l.endDate.getTime())));
    for (const l of today) {
      if (l.startDate.getTime() > t && l.startDate.getTime() - freeAt.getTime() <= CHAIN_GAP_MIN * 60_000) {
        if (l.endDate > freeAt) freeAt = l.endDate;
      }
    }
    const next = today.find((l) => l.startDate.getTime() >= freeAt.getTime()) ?? null;
    return { state: 'busy', lesson: current[0], freeAt, next };
  }
  const next = today.find((l) => l.startDate.getTime() > t) ?? null;
  return { state: 'free', next, freeFor: next ? Math.round((next.startDate.getTime() - t) / 60_000) : null };
}

/** The (non-cancelled) lessons on the day of `at`, in order. */
export const lessonsOnDay = (lessons: Lesson[], at: Date) => active(lessons, at);
