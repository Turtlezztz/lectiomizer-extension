// Finding a room from the short name lessons use ("A12", "1.07") and laying
// out its day as bookings with the free time between them.
import { fold, type DirectoryEntry } from '@/features/people/directory';
import type { Lesson } from '@/features/schedule/lessons';

/** Lesson rooms are the room's symbol ("A12"); the room list labels them "A12 Klasselokale". */
export function findRoom(entries: DirectoryEntry[], room: string): DirectoryEntry | undefined {
  const r = fold(room);
  if (!r) return undefined;
  return (
    entries.find((e) => fold(e.label) === r) ??
    entries.find((e) => fold(e.label).split(' ')[0] === r) ??
    entries.find((e) => fold(e.label).startsWith(`${r} `))
  );
}

/** Free time shorter than this between bookings is just a break. */
export const GAP_MIN = 15;

export type DayItem = { type: 'busy'; lesson: Lesson } | { type: 'free'; from: Date; to: Date };

/** A day's (non-cancelled, sorted) lessons with the free stretches between them. */
export function dayPlan(lessons: Lesson[]): DayItem[] {
  const out: DayItem[] = [];
  let busyUntil: Date | null = null;
  for (const l of lessons) {
    if (busyUntil && l.startDate.getTime() - busyUntil.getTime() >= GAP_MIN * 60_000) out.push({ type: 'free', from: busyUntil, to: l.startDate });
    out.push({ type: 'busy', lesson: l });
    if (!busyUntil || l.endDate > busyUntil) busyUntil = l.endDate;
  }
  return out;
}

/** "ma 28/9" or "28/9-2026" → that date, in the year closest to `now`. */
export function dateFromShort(text: string | undefined, now: Date): Date | null {
  const m = (text || '').match(/(\d{1,2})\/(\d{1,2})(?:[-\s](\d{4}))?/);
  if (!m) return null;
  const day = +m[1];
  const month = +m[2] - 1;
  if (m[3]) return new Date(+m[3], month, day, 12);
  const candidates = [-1, 0, 1].map((y) => new Date(now.getFullYear() + y, month, day, 12));
  return candidates.sort((a, b) => Math.abs(a.getTime() - now.getTime()) - Math.abs(b.getTime() - now.getTime()))[0];
}
