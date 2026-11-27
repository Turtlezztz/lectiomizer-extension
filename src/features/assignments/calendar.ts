// Pure logic for the month calendar on Opgaver: the grid of days and which
// assignments are due on each.

/** "2026-11-27" for a local date. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface MonthCell {
  date: Date;
  key: string;
  inMonth: boolean;
}

/** The weeks (Monday first) that show `month` of `year`: whole weeks, 4–6 of them. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const weeks: MonthCell[][] = [];
  for (let d = new Date(start); d <= last || weeks.at(-1)?.length !== 7; ) {
    if (!weeks.length || weeks.at(-1)!.length === 7) weeks.push([]);
    weeks.at(-1)!.push({ date: new Date(d), key: dayKey(d), inMonth: d.getMonth() === month });
    d.setDate(d.getDate() + 1);
  }
  return weeks;
}

/** Items by the day of their deadline, each day sorted by time. Items without a deadline are left out. */
export function byDay<T extends { deadline: Date | null }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    if (!item.deadline) continue;
    const key = dayKey(item.deadline);
    const list = out.get(key);
    if (list) list.push(item);
    else out.set(key, [item]);
  }
  for (const list of out.values()) list.sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime());
  return out;
}

/** Move a { year, month } by `delta` months. */
export function shiftMonth({ year, month }: { year: number; month: number }, delta: number) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** "november 2026" */
export const monthLabel = (year: number, month: number) => new Date(year, month, 1).toLocaleDateString('da-DK', { month: 'long', year: 'numeric' });

export const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
