// Shape of readAbsence() output + small pure helpers.

export interface AbsenceLesson {
  href: string | null;
  date: string;
  module: string;
  room: string;
  status: 'normal' | 'changed' | 'cancelled';
  holds: string[];
  teachers: string[];
  title: string;
}

export interface AbsenceRow {
  week: string;
  lesson: AbsenceLesson | null;
  lessonText: string;
  amount: string;
  registered: string;
  registeredBy: string;
  remark: string;
  cause: string;
  comment: string;
  edit: string | null;
}

export interface AbsenceTable {
  rows: AbsenceRow[];
  empty: string | null;
}

export interface AbsenceData {
  totals: Array<{ value: string; label: string }>;
  missing: AbsenceTable | null;
  history: AbsenceTable | null;
  /** Lectio's link to the per-hold overview (subnav/fravaerelev.aspx), if the page has one. */
  overview: string | null;
}

/** Absence over a set of modules (or elevtimer): any part Lectio does not show is null. */
export interface AbsenceGroup {
  absent: number | null;
  total: number | null;
  percent: number | null;
}

/** "Periode" = the date range on Lectio's page (a month by default); "settled" = opgjort, the year so far. */
export interface AbsenceKind {
  period: AbsenceGroup;
  settled: AbsenceGroup;
}

export interface AbsenceHoldRow {
  hold: string;
  href: string | null;
  /** Almindeligt fravær, counted in modules. */
  regular: AbsenceKind;
  /** Skriftligt fravær, counted in elevtimer. */
  written: AbsenceKind;
}

export interface AbsenceRemark {
  date: string;
  by: string;
  type: string;
  note: string;
}

/** readAbsenceOverview() output: subnav/fravaerelev.aspx. */
export interface AbsenceOverview {
  holds: AbsenceHoldRow[];
  total: Pick<AbsenceHoldRow, 'regular' | 'written'>;
  detailed: boolean;
  /** Lectio's "Vis detaljer" checkbox when it is off (a postback handle), else null. */
  detailToggle: Element | null;
  period: { from: string; to: string } | null;
  remarks: AbsenceRemark[];
}

/** "6,9%" → 6.9; non-percent values → null. */
export function parsePercent(value: string): number | null {
  const m = (value || '').match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** "Modul 100%" → { label: "Modul", percent: 100 } */
export function parseAmount(amount: string) {
  const percent = parsePercent(amount);
  const label = amount.replace(/-?\d+(?:[.,]\d+)?\s*%/, '').trim();
  return { label, percent };
}

export type AbsenceTone = 'ok' | 'warn' | 'high';
/** Visual tone only — schools set their own thresholds. */
export const absenceTone = (pct: number): AbsenceTone => (pct >= 15 ? 'high' : pct >= 10 ? 'warn' : 'ok');

/** Primary text for a row: "ma 5/10 · 2. modul". */
export const lessonWhen = (row: AbsenceRow) =>
  row.lesson ? [row.lesson.date, row.lesson.module].filter(Boolean).join(' · ') : row.lessonText;

/** Group rows by week keeping order. */
export function groupByWeek(rows: AbsenceRow[]) {
  const groups = new Map<string, AbsenceRow[]>();
  for (const row of rows) {
    const key = row.week || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return Array.from(groups, ([week, items]) => ({ week, rows: items }));
}
