// Fraværsberegner: the overall (all holds) buffer and projection. Pure, no DOM.
import { parseAmount, type AbsenceKind, type AbsenceRow } from './absence-utils';

export const DEFAULT_THRESHOLD = 10;
export const THRESHOLD_KEY = 'absence:threshold';

/** Module counts behind the overall percentage. */
export interface Counts {
  /** Modules missed so far (may be fractional: "Modul 50%"). */
  absent: number;
  /** Modules held so far ("opgjort"). */
  held: number;
  /** Modules planned for the whole year/period, when Lectio says. */
  yearTotal: number | null;
  /** 'lectio' = read from Lectio's overview; 'estimate' = derived from the registrations. */
  source: 'lectio' | 'estimate';
}

const EPS = 1e-9;

/** "Modul 100%" → 1, "Modul 50%" → 0.5; anything that is not a module (e.g. elevtid) → 0. */
export function modulesOf(amount: string): number {
  const { label, percent } = parseAmount(amount || '');
  if (percent === null || (label && !/modul/i.test(label))) return 0;
  return percent / 100;
}

/** Sum of module absence across registrations. */
export const absentModules = (rows: AbsenceRow[]) => rows.reduce((sum, row) => sum + modulesOf(row.amount), 0);

/**
 * Held modules estimated from the percentage and the registered absence:
 * held ≈ absent / pct. Null when it cannot be told (no absence, or 0 %).
 */
export function estimateCounts(percent: number | null, rows: AbsenceRow[]): Counts | null {
  const absent = absentModules(rows);
  if (percent === null || percent <= 0 || absent <= 0) return null;
  return { absent, held: Math.round(absent / (percent / 100)), yearTotal: null, source: 'estimate' };
}

/** Largest whole N such that x + N < limit (N ≥ 0). */
const below = (room: number) => Math.max(0, Math.ceil(room - EPS) - 1);

/**
 * Modules you can still miss in a row, counted against the modules held so far,
 * before the percentage reaches the threshold: largest N with (a+N)/(h+N) < t.
 */
export function bufferNow(absent: number, held: number, threshold: number): number {
  const t = threshold / 100;
  if (t >= 1) return Infinity;
  return below((t * held - absent) / (1 - t));
}

/** Modules you can still miss over the whole year: largest N with (a+N)/total < t. */
export function bufferYear(absent: number, yearTotal: number, threshold: number): number {
  return below((threshold / 100) * yearTotal - absent);
}

/** Modules without absence needed to get back under the threshold: smallest M with a/(h+M) < t. */
export function modulesToRecover(absent: number, held: number, threshold: number): number {
  const t = threshold / 100;
  if (t <= 0) return Infinity;
  return Math.max(0, Math.floor(absent / t - held + EPS) + 1);
}

/**
 * Lectio's overview counts, if they agree with the page's own percentage
 * (guards against reading the wrong columns), else an estimate from the registrations.
 */
export function resolveCounts(
  overview: { absent: number | null; total: number | null } | null | undefined,
  percent: number | null,
  rows: AbsenceRow[],
): Counts | null {
  if (overview && overview.absent !== null && overview.total !== null && overview.total > 0 && (percent === null || Math.abs(percentOf(overview.absent, overview.total) - percent) <= 1)) {
    return { absent: overview.absent, held: overview.total, yearTotal: null, source: 'lectio' };
  }
  return estimateCounts(percent, rows);
}

// --- breakdown per hold ----------------------------------------------------------

export interface Slice {
  hold: string;
  href: string | null;
  absent: number;
  total: number;
  /** The hold's own percentage. */
  percent: number;
  /** This hold's part of all the absence, 0–1. */
  share: number;
}

/**
 * Where the absence lies: one slice per hold with absence, largest first, plus the
 * holds without any. Holds Lectio gives no counts for are left out.
 */
export function breakdown(
  holds: Array<{ hold: string; href: string | null; regular: AbsenceKind; written: AbsenceKind }>,
  kind: 'regular' | 'written',
  scope: 'period' | 'settled',
): { slices: Slice[]; clean: string[]; absent: number; total: number } {
  const counted = holds.flatMap((h) => {
    const g = h[kind][scope];
    return g.absent !== null && g.total !== null && g.total > 0 ? [{ hold: h.hold, href: h.href, absent: g.absent, total: g.total }] : [];
  });
  const absent = counted.reduce((sum, h) => sum + h.absent, 0);
  const total = counted.reduce((sum, h) => sum + h.total, 0);
  const slices = counted
    .filter((h) => h.absent > 0)
    .map((h) => ({ ...h, percent: percentOf(h.absent, h.total), share: absent > 0 ? h.absent / absent : 0 }))
    .sort((a, b) => b.absent - a.absent);
  return { slices, clean: counted.filter((h) => h.absent <= 0).map((h) => h.hold), absent, total };
}

export const percentOf =(absent: number, held: number) => (held > 0 ? (absent / held) * 100 : 0);

// --- school year -------------------------------------------------------------------
// A Danish school year runs roughly from mid-August to late June. Good enough for a
// rough projection; the real calendar (holidays, exams) is not known here.

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function schoolYear(today: Date) {
  const y = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return { start: new Date(y, 7, 10), end: new Date(y + 1, 5, 25) };
}

/** Fraction of the school year passed, 0–1. */
export function yearProgress(today: Date): number {
  const { start, end } = schoolYear(today);
  return Math.min(1, Math.max(0, (startOfDay(today).getTime() - start.getTime()) / (end.getTime() - start.getTime())));
}

/** "ma 5/10" → Date in the school year around `today` (dates never lie far in the future). */
export function parseLessonDate(value: string, today: Date): Date | null {
  const m = (value || '').match(/(\d{1,2})\/(\d{1,2})(?:-(\d{4}))?/);
  if (!m) return null;
  const [d, mo] = [+m[1], +m[2] - 1];
  if (m[3]) return new Date(+m[3], mo, d);
  let date = new Date(today.getFullYear(), mo, d);
  if (date.getTime() - startOfDay(today).getTime() > 14 * DAY) date = new Date(today.getFullYear() - 1, mo, d);
  return date;
}

export const RECENT_DAYS = 28;

/** Module absence registered within the last `days` days. */
export function recentAbsent(rows: AbsenceRow[], today: Date, days = RECENT_DAYS): number {
  const from = startOfDay(today).getTime() - days * DAY;
  return rows.reduce((sum, row) => {
    const date = row.lesson ? parseLessonDate(row.lesson.date, today) : null;
    return date && date.getTime() > from && date.getTime() <= startOfDay(today).getTime() + DAY ? sum + modulesOf(row.amount) : sum;
  }, 0);
}

export interface Projection {
  /** Projected overall percentage at year end. */
  percent: number;
  /** Whether the recent pace (last weeks) drove it, rather than the year's average. */
  recent: boolean;
}

/**
 * Where the percentage ends at year end if the pace continues. The pace is the
 * last weeks' absence (from the registrations) when that span can be told, else
 * the average so far. The remaining modules come from Lectio's year total, or
 * from how far into the school year we are.
 */
export function projectYearEnd(counts: Counts, rows: AbsenceRow[], today: Date): Projection | null {
  const { absent, held } = counts;
  if (held <= 0) return null;
  const progress = yearProgress(today);
  const total = counts.yearTotal ?? (progress >= 0.05 ? held / progress : null);
  if (!total || total <= held) return null;
  const daysPassed = (startOfDay(today).getTime() - schoolYear(today).start.getTime()) / DAY;
  let rate = absent / held;
  let recent = false;
  if (daysPassed >= RECENT_DAYS * 2) {
    const recentHeld = (held * RECENT_DAYS) / daysPassed;
    rate = Math.min(1, recentAbsent(rows, today) / recentHeld);
    recent = true;
  }
  return { percent: ((absent + rate * (total - held)) / total) * 100, recent };
}

export type GaugeTone = 'ok' | 'warn' | 'high';
/** Yellow from 80 % of the threshold, red at or over it. */
export const gaugeTone = (percent: number, threshold: number): GaugeTone =>
  percent >= threshold ? 'high' : percent >= threshold * 0.8 ? 'warn' : 'ok';

/** 6.9 → "6,9 %" */
export const fmtPercent = (value: number) => `${value.toLocaleString('da-DK', { maximumFractionDigits: 1 })} %`;

/** Selection helpers for the missing-cause list -------------------------------------- */

/** Group rows by lesson date, keeping order. */
export function groupByDay(rows: AbsenceRow[]) {
  const groups = new Map<string, AbsenceRow[]>();
  for (const row of rows) {
    const key = row.lesson?.date || row.week || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return Array.from(groups, ([day, items]) => ({ day, rows: items }));
}

/** Toggle many keys at once: all on if any is off, else all off. */
export function toggleAll(selected: ReadonlySet<string>, keys: string[]): Set<string> {
  const next = new Set(selected);
  const allOn = keys.every((k) => next.has(k));
  for (const k of keys) {
    if (allOn) next.delete(k);
    else next.add(k);
  }
  return next;
}
