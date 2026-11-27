// Arbejdsbyrde: the elevtimer (student hours) of assignments due on each day,
// from the assignment list (OpgaverElev.aspx) the app already reads.
import { dayKey } from './week';

export interface WorkloadItem {
  title: string;
  hold: string;
  deadline: Date | null;
  studentTime: string;
  statusKind: string;
}

export interface DayLoad {
  hours: number;
  items: Array<{ title: string; hold: string; hours: number }>;
}

/** Lectio writes elevtid as "2,50", "1.5", "3 timer" or leaves it empty. */
export function parseHours(value: string | null | undefined): number {
  const m = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Hours due per local day (YYYY-MM-DD) for assignments not handed in. */
export function workloadByDay(items: WorkloadItem[]): Map<string, DayLoad> {
  const out = new Map<string, DayLoad>();
  for (const item of items) {
    if (!item.deadline || item.statusKind === 'delivered') continue;
    const hours = parseHours(item.studentTime);
    if (!hours) continue;
    const key = dayKey(item.deadline);
    const day = out.get(key) ?? { hours: 0, items: [] };
    day.hours += hours;
    day.items.push({ title: item.title, hold: item.hold, hours });
    out.set(key, day);
  }
  return out;
}

/** "2,5 t" */
export const hoursText = (h: number) => `${String(Math.round(h * 10) / 10).replace('.', ',')} t`;

/** Width of a day's bar: a full bar is a heavy day (`full` hours or more). */
export const loadRatio = (hours: number, full = 6) => Math.max(0, Math.min(1, hours / full));
