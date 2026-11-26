// Danish date/time formatting shared across views.
const da = 'da-DK';
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayDiff = (d: Date, now = new Date()) => Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);

export const fmtTime = (d: Date) => d.toLocaleTimeString(da, { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
export const fmtDate = (d: Date) => d.toLocaleDateString(da, { day: 'numeric', month: 'short' });
export const fmtWeekday = (d: Date) => d.toLocaleDateString(da, { weekday: 'long' });
export const fmtLongDate = (d: Date) => d.toLocaleDateString(da, { weekday: 'long', day: 'numeric', month: 'long' });

/** "i dag", "i morgen", "i går", "om 3 dage", "for 2 dage siden", else date. */
export function relativeDay(d: Date, now = new Date()): string {
  const diff = dayDiff(d, now);
  if (diff === 0) return 'i dag';
  if (diff === 1) return 'i morgen';
  if (diff === -1) return 'i går';
  if (diff > 1 && diff < 7) return fmtWeekday(d);
  if (diff > 0 && diff < 14) return `om ${diff} dage`;
  if (diff < 0 && diff > -14) return `for ${-diff} dage siden`;
  return fmtDate(d);
}

/** "om 2 t 15 min", "om 12 min", "nu" */
export function untilText(target: Date, now = new Date()): string {
  const mins = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return 'nu';
  if (mins < 60) return `om ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `om ${h} t ${m} min` : `om ${h} t`;
  return `om ${Math.round(h / 24)} dage`;
}

/** Deadline urgency for badges. */
export function urgency(deadline: Date | null | undefined, now = new Date()): 'overdue' | 'soon' | 'week' | 'later' | 'none' {
  if (!deadline) return 'none';
  const h = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (h < 0) return 'overdue';
  if (h < 48) return 'soon';
  if (h < 24 * 7) return 'week';
  return 'later';
}
