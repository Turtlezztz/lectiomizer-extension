// ISO-week helpers for the schedule page. Lectio addresses a week as
// ?week=WWYYYY (e.g. 412026); we mirror that in the app URL.
import { isoWeek } from '@/lib/lectio/readers/schedule.js';

export interface WeekRef {
  week: number;
  year: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const da = 'da-DK';

export const weekParam = ({ week, year }: WeekRef) => pad(week) + year;

export function parseWeekParam(value: string | null | undefined): WeekRef | null {
  const m = (value || '').match(/^(\d{1,2})(\d{4})$/);
  if (!m) return null;
  const week = +m[1];
  const year = +m[2];
  if (week < 1 || week > 53 || year < 2000 || year > 2100) return null;
  // Normalise e.g. week 53 of a 52-week year into the following week 1.
  return weekOf(mondayOf({ week, year }));
}

export function weekOf(date: Date): WeekRef {
  const { week, year } = isoWeek(date);
  return { week, year };
}

export const sameWeek = (a: WeekRef, b: WeekRef) => a.week === b.week && a.year === b.year;

/** Local midnight of the Monday of an ISO week. */
export function mondayOf({ week, year }: WeekRef): Date {
  const jan4 = new Date(year, 0, 4);
  const weekday = jan4.getDay() || 7;
  return new Date(year, 0, 4 - weekday + 1 + (week - 1) * 7);
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const shiftWeek = (ref: WeekRef, n: number) => weekOf(addDays(mondayOf(ref), 7 * n));

/** Mon..Sun as local dates. */
export const weekDates = (ref: WeekRef) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(ref), i));

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Whole weeks from `from` to `to` (positive = later). */
export const weekDiff = (from: WeekRef, to: WeekRef) => Math.round((mondayOf(to).getTime() - mondayOf(from).getTime()) / (7 * 86_400_000));

export function relativeWeek(ref: WeekRef, now = new Date()): string | null {
  const diff = weekDiff(weekOf(now), ref);
  if (diff === 0) return 'Denne uge';
  if (diff === 1) return 'Næste uge';
  if (diff === -1) return 'Sidste uge';
  if (diff > 1 && diff < 9) return `Om ${diff} uger`;
  if (diff < -1 && diff > -9) return `${-diff} uger siden`;
  return null;
}

const month = (d: Date, style: 'short' | 'long') => d.toLocaleDateString(da, { month: style });

/** "5.–9. oktober 2026", "28. sep. – 2. okt. 2026", "29. dec. 2025 – 2. jan. 2026". */
export function fmtRange(from: Date, to: Date): string {
  if (from.getFullYear() !== to.getFullYear()) {
    return `${from.getDate()}. ${month(from, 'short')} ${from.getFullYear()} – ${to.getDate()}. ${month(to, 'short')} ${to.getFullYear()}`;
  }
  if (from.getMonth() !== to.getMonth()) {
    return `${from.getDate()}. ${month(from, 'short')} – ${to.getDate()}. ${month(to, 'short')} ${to.getFullYear()}`;
  }
  return `${from.getDate()}.–${to.getDate()}. ${month(to, 'long')} ${to.getFullYear()}`;
}

export const WEEKDAYS_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
export const WEEKDAYS_LONG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
