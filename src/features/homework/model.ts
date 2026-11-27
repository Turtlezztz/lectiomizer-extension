// Shape of readHomework() output + grouping for the homework page.
import type { ActivityLesson } from '@/features/lesson/lesson-utils';

export interface HomeworkRow {
  lesson: ActivityLesson;
  /** Lesson start; only the day is known when Lectio leaves out the tooltip. */
  start: Date | null;
  end: Date | null;
  /** Tooltip tail ("Lektier:\n- …\n\nNote:\n…"), shortened by Lectio. */
  details: string;
  /** Heading of each homework item on the lesson. */
  items: Array<{ title: string; href: string }>;
  note: string;
}

export interface HomeworkData {
  rows: HomeworkRow[];
}

export interface HomeworkDay {
  key: string;
  date: Date | null;
  rows: HomeworkRow[];
}

/** Rows by day, earliest first; rows without a date end up last. */
export function groupByDay(rows: HomeworkRow[]): HomeworkDay[] {
  const days = new Map<string, HomeworkDay>();
  const sorted = [...rows].sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity));
  for (const row of sorted) {
    const key = row.start ? `${row.start.getFullYear()}-${row.start.getMonth()}-${row.start.getDate()}` : '';
    if (!days.has(key)) days.set(key, { key, date: row.start, rows: [] });
    days.get(key)!.rows.push(row);
  }
  return [...days.values()];
}
