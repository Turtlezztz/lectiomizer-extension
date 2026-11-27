// "Lectio Wrapped": pure counting over data the readers already give us
// (schedule weeks, the assignment list and the absence totals). Nothing here
// guesses – a stat is null when the data doesn't support it.
import { isoWeek } from '@/lib/lectio/readers/schedule.js';
import { splitPerson, subjectName, type LessonStatus, type RawLesson } from '@/features/schedule/lessons';
import type { AssignmentItem } from '@/features/assignments/model';
import { parsePercent, type AbsenceData } from '@/features/absence/absence-utils';
import { addDays, mondayOf, weekOf, type WeekRef } from '@/features/schedule/week';

/** What we keep of a lesson (small enough to store a whole year locally). */
export interface SlimLesson {
  id: string;
  start: string;
  end: string;
  status: LessonStatus;
  title: string;
  holds: string[];
  teachers: string[];
  rooms: string[];
}

export const slim = (l: RawLesson): SlimLesson => ({
  id: l.id,
  start: l.start,
  end: l.end,
  status: l.status,
  title: l.title,
  holds: l.holds || [],
  teachers: l.teachers || [],
  rooms: l.rooms || [],
});

/** Lessons that really fall in the given week (Lectio answers weeks outside the school year with another week). */
export function inWeek(lessons: RawLesson[], ref: WeekRef): RawLesson[] {
  const from = mondayOf(ref).getTime();
  const to = addDays(mondayOf(ref), 7).getTime();
  return lessons.filter((l) => {
    const t = new Date(l.start).getTime();
    return t >= from && t < to;
  });
}

/** ISO weeks of a school year (August–July) up to and including `now`'s week. */
export function schoolYearWeeks(year: number, now = new Date()): WeekRef[] {
  const first = mondayOf(weekOf(new Date(year, 7, 1)));
  const end = Math.min(new Date(year + 1, 6, 31).getTime(), now.getTime());
  const out: WeekRef[] = [];
  for (let d = first; d.getTime() <= end; d = addDays(d, 7)) out.push(weekOf(d));
  return out;
}

/** A week is finished (its lessons won't change any more) when it ended before `now`. */
export const weekFinished = (ref: WeekRef, now = new Date()) => addDays(mondayOf(ref), 7).getTime() <= now.getTime();

function top(counts: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) if (!best || count > best.count || (count === best.count && key.localeCompare(best.key, 'da') < 0)) best = { key, count };
  return best;
}

const bump = (m: Map<string, number>, key: string, by = 1) => m.set(key, (m.get(key) || 0) + by);

export interface LessonStats {
  /** Lessons held so far (not cancelled, already over). */
  held: number;
  /** Hours spent in those lessons. */
  hours: number;
  cancelled: number;
  mostCancelled: { subject: string; count: number } | null;
  busiestWeek: { week: number; year: number; count: number } | null;
  topSubject: { subject: string; count: number; hours: number } | null;
  topRoom: { room: string; count: number } | null;
  topTeacher: { name: string; count: number } | null;
}

export function lessonStats(lessons: SlimLesson[], now = new Date()): LessonStats {
  const seen = new Set<string>();
  let held = 0;
  let minutes = 0;
  let cancelled = 0;
  const cancelledBy = new Map<string, number>();
  const perWeek = new Map<string, number>();
  const subjects = new Map<string, number>();
  const subjectMinutes = new Map<string, number>();
  const rooms = new Map<string, number>();
  const teachers = new Map<string, number>();
  for (const l of lessons) {
    const key = l.id || `${l.start}|${l.holds.join()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Only teaching: modules with a team (events like "Studietur" have none).
    if (!l.holds.length) continue;
    const start = new Date(l.start);
    const end = new Date(l.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() > now.getTime()) continue;
    const subject = subjectName(l.holds[0]);
    if (l.status === 'cancelled') {
      cancelled++;
      bump(cancelledBy, subject);
      continue;
    }
    held++;
    const length = Math.max(0, (end.getTime() - start.getTime()) / 60_000);
    minutes += length;
    const { week, year } = isoWeek(start);
    bump(perWeek, `${year}-${String(week).padStart(2, '0')}`);
    bump(subjects, subject);
    bump(subjectMinutes, subject, length);
    if (l.rooms[0]) bump(rooms, l.rooms[0]);
    for (const t of l.teachers) bump(teachers, t);
  }
  const week = top(perWeek);
  const subject = top(subjects);
  const cancelledTop = top(cancelledBy);
  const room = top(rooms);
  const teacher = top(teachers);
  return {
    held,
    hours: Math.round(minutes / 60),
    cancelled,
    mostCancelled: cancelledTop ? { subject: cancelledTop.key, count: cancelledTop.count } : null,
    busiestWeek: week ? { year: +week.key.slice(0, 4), week: +week.key.slice(5), count: week.count } : null,
    topSubject: subject ? { subject: subject.key, count: subject.count, hours: Math.round((subjectMinutes.get(subject.key) || 0) / 60) } : null,
    topRoom: room ? { room: room.key, count: room.count } : null,
    topTeacher: teacher ? { name: splitPerson(teacher.key).name, count: teacher.count } : null,
  };
}

/** "4,00" → 4, "1,5 timer" → 1.5, "" → 0 */
export function parseHours(value: string | null | undefined): number {
  const m = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  const n = m ? Number(m[1].replace(',', '.')) : 0;
  return Number.isFinite(n) ? n : 0;
}

export interface AssignmentStats {
  delivered: number;
  total: number;
  /** Elevtimer of the handed-in assignments. */
  hours: number;
}

/** Assignments of the school year (by deadline; ones without a deadline count as this year). */
export function assignmentStats(items: Pick<AssignmentItem, 'statusKind' | 'deadline' | 'studentTime'>[], year: number): AssignmentStats {
  const inYear = items.filter((a) => {
    if (!a.deadline) return true;
    const d = a.deadline;
    return (d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1) === year;
  });
  const delivered = inYear.filter((a) => a.statusKind === 'delivered');
  const hours = delivered.reduce((sum, a) => sum + parseHours(a.studentTime), 0);
  return { delivered: delivered.length, total: inYear.length, hours: Math.round(hours * 10) / 10 };
}

/** Lectio's first absence total that is a percentage ("Fravær for moduler"). */
export function absenceStat(data: Pick<AbsenceData, 'totals'> | undefined): { label: string; value: string; percent: number } | null {
  for (const t of data?.totals || []) {
    const percent = parsePercent(t.value);
    if (percent !== null) return { label: t.label, value: t.value, percent };
  }
  return null;
}

/** Danish number: 1234.5 → "1.234,5". */
export const fmtNumber = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1 });
