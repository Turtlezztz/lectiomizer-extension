// Free time on a schedule day: gaps between lessons (mellemtimer), time two
// people both have free, and when the next school day starts and ends.
// Works on minutes since midnight; cancelled lessons count as free.
import { dayKey } from './week';

export interface Span {
  startMin: number;
  endMin: number;
}

type Timed = Span & { status?: string };

/** A free stretch shorter than this is an ordinary break, not a mellemtime. */
export const MIN_GAP = 30;

/** Busy stretches of a day: non-cancelled lessons, overlapping or touching ones merged. */
export function busySpans(lessons: Timed[]): Span[] {
  const sorted = lessons.filter((l) => l.status !== 'cancelled').sort((a, b) => a.startMin - b.startMin);
  const out: Span[] = [];
  for (const l of sorted) {
    const last = out[out.length - 1];
    if (last && l.startMin <= last.endMin) last.endMin = Math.max(last.endMin, l.endMin);
    else out.push({ startMin: l.startMin, endMin: l.endMin });
  }
  return out;
}

/** Mellemtimer: free stretches of at least `min` minutes between the day's first and last lesson. */
export function gapsOfDay(lessons: Timed[], min = MIN_GAP): Span[] {
  const busy = busySpans(lessons);
  const out: Span[] = [];
  for (let i = 1; i < busy.length; i++) {
    const gap = { startMin: busy[i - 1].endMin, endMin: busy[i].startMin };
    if (gap.endMin - gap.startMin >= min) out.push(gap);
  }
  return out;
}

/**
 * Stretches where neither person has a lesson, within the school day: from the
 * earlier of their first lessons to the later of their last ones. A day where
 * one of them has nothing is free for them all day, so only the other's gaps
 * remain – and before/after their lessons inside the window.
 */
export function commonFree(a: Timed[], b: Timed[], min = MIN_GAP): Span[] {
  const busyA = busySpans(a);
  const busyB = busySpans(b);
  if (!busyA.length && !busyB.length) return [];
  // With only one person busy there's no shared "school day" to compare beyond their own gaps.
  if (!busyA.length || !busyB.length) return gapsOfDay(busyA.length ? a : b, min);
  const from = Math.min(busyA[0].startMin, busyB[0].startMin);
  const to = Math.max(busyA[busyA.length - 1].endMin, busyB[busyB.length - 1].endMin);
  const busy = busySpans([...busyA, ...busyB]);
  const out: Span[] = [];
  let cursor = from;
  for (const s of busy) {
    if (s.startMin - cursor >= min) out.push({ startMin: cursor, endMin: s.startMin });
    cursor = Math.max(cursor, s.endMin);
  }
  if (to - cursor >= min) out.push({ startMin: cursor, endMin: to });
  return out;
}

export interface SchoolDay<T> {
  date: Date;
  first: T;
  last: T;
}

/**
 * The first day after `now`'s date with a (non-cancelled) lesson: when it
 * starts and when it ends. Null when none of the given lessons are later.
 */
export function nextSchoolDay<T extends { startDate: Date; endDate: Date; status?: string }>(lessons: T[], now: Date): SchoolDay<T> | null {
  const today = dayKey(now);
  const later = lessons.filter((l) => l.status !== 'cancelled' && dayKey(l.startDate) > today).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (!later.length) return null;
  const key = dayKey(later[0].startDate);
  const day = later.filter((l) => dayKey(l.startDate) === key);
  const last = day.reduce((m, l) => (l.endDate > m.endDate ? l : m), day[0]);
  return { date: new Date(later[0].startDate.getFullYear(), later[0].startDate.getMonth(), later[0].startDate.getDate()), first: day[0], last };
}

/** "45 min", "1 t 30 min". */
export function minutesText(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h} t ${m} min` : `${h} t`) : `${m} min`;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** 615 → "10:15" (same style as fmtTime). */
export const minText = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
