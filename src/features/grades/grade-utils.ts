// Pure helpers for the grades page (shape of readGrades() output + 7-point scale maths).

export interface SectionError {
  error: string;
}

export interface Grade {
  type: string;
  value: string;
  final: boolean;
  extra: string[];
  xprs: string | null;
  source: string | null;
  weight: string | null;
}

export interface SubjectGrades {
  subject: string;
  hold: string;
  forms: Array<{ form: string; grades: Grade[] }>;
}

export interface RecordTable {
  columns: string[];
  rows: Array<Record<string, string>>;
  empty: string | null;
}

export interface Diploma {
  title: string;
  groups: string[];
  lines: Array<{ subject: string; results: Array<{ label: string; fields: Record<string, string | null>; empty: boolean }> }>;
  averages: Array<{ label: string; value: string; note: string | null }>;
}

export interface GradesData {
  term: string | null;
  notices: string[];
  current: { types: string[]; subjects: SubjectGrades[]; empty: string | null };
  notes: RecordTable | SectionError | null;
  remarks: RecordTable | SectionError | null;
  diplomas: Array<Diploma | SectionError>;
  protocol: RecordTable | SectionError | null;
}

export const isError = (x: unknown): x is SectionError => !!x && typeof x === 'object' && 'error' in x;

export const SCALE = ['-3', '00', '02', '4', '7', '10', '12'] as const;

/** Parse "7", "02", "-3", "8,4" → number; anything else (B, Bestået) → null. */
export function gradeNumber(value: string | null | undefined): number | null {
  const s = (value ?? '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Canonical 7-point label ("2" → "02", "0" → "00"), or null if off-scale. */
export function scaleLabel(value: string): string | null {
  const n = gradeNumber(value);
  if (n === null) return null;
  const hit = SCALE.find((s) => Number(s) === n);
  return hit ?? null;
}

export type GradeTone = 'top' | 'good' | 'mid' | 'low' | 'fail' | 'none';

export function gradeTone(value: string | null | undefined): GradeTone {
  const n = gradeNumber(value);
  if (n === null) return 'none';
  if (n >= 10) return 'top';
  if (n >= 7) return 'good';
  if (n >= 4) return 'mid';
  if (n >= 2) return 'low';
  return 'fail';
}

const TYPE_NAMES: Array<[RegExp, string, string]> = [
  [/^1\.?\s*standpunkt/i, '1. standpunkt', '1. stdp.'],
  [/^2\.?\s*standpunkt/i, '2. standpunkt', '2. stdp.'],
  [/^afsl(uttende|\.)/i, 'Afsluttende standpunkt', 'Afsl.'],
  [/intern prøve/i, 'Intern prøve', 'Intern'],
  [/^årskar/i, 'Årskarakter', 'Års'],
  [/^eksamens/i, 'Eksamen', 'Eksamen'],
];
export const typeName = (label: string) => TYPE_NAMES.find(([p]) => p.test(label))?.[1] ?? label;
export const typeShort = (label: string) => TYPE_NAMES.find(([p]) => p.test(label))?.[2] ?? label;

/** "6688A Dansk" → "Dansk" */
export const xprsName = (value = '') => value.replace(/^\d{3,6}[A-Z-]?\s+/, '');

/** "0,75" → 0.75 */
export const parseWeight = (value: string | null | undefined): number | null => {
  const n = Number((value ?? '').replace(',', '.'));
  return value && Number.isFinite(n) && n > 0 ? n : null;
};

export const fmtNumber = (n: number, digits = 1) => n.toLocaleString('da-DK', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** The most advanced grade of a subject form (final if marked, else the last one). */
export function latestGrade(grades: Grade[]): Grade | null {
  return grades.find((g) => g.final) ?? grades[grades.length - 1] ?? null;
}

export interface Averages {
  unweighted: number | null;
  weighted: number | null;
  count: number;
  distribution: Record<(typeof SCALE)[number], number>;
}

/** Averages + distribution over the latest numeric grade of each subject form. */
export function summarize(subjects: SubjectGrades[]): Averages {
  const distribution = Object.fromEntries(SCALE.map((s) => [s, 0])) as Averages['distribution'];
  const entries: Weighted[] = [];
  for (const subject of subjects) {
    for (const form of subject.forms) {
      const g = latestGrade(form.grades);
      const n = gradeNumber(g?.value);
      const label = g && scaleLabel(g.value);
      if (n === null || !label) continue;
      distribution[label as keyof typeof distribution]++;
      entries.push({ value: n, weight: parseWeight(g!.weight) ?? 1 });
    }
  }
  const count = entries.length;
  const unweighted = count ? entries.reduce((sum, e) => sum + e.value, 0) / count : null;
  return { unweighted, weighted: weightedMean(entries), count, distribution };
}

export interface Weighted {
  value: number;
  weight: number;
}

/** Σ(value·weight) / Σweight — the one weighting rule for every average on the page. */
export function weightedMean(entries: Weighted[]): number | null {
  let sum = 0;
  let total = 0;
  for (const e of entries) {
    sum += e.value * e.weight;
    total += e.weight;
  }
  return total ? sum / total : null;
}

// Grades that describe the same ongoing assessment over the year (not separate tests).
const PROGRESSION = /standpunkt|^årskar/i;

export interface Trend {
  points: Array<{ type: string; value: number }>;
  /** last − first */
  delta: number;
  direction: 'up' | 'down' | 'same';
}

/**
 * How a subject form's grade developed: 1. standpunkt → 2. standpunkt → afsluttende/årskarakter,
 * in Lectio's column order. Prøver (intern prøve, eksamen) are left out. Null with fewer than two.
 */
export function gradeTrend(grades: Grade[]): Trend | null {
  const points = grades
    .filter((g) => PROGRESSION.test(g.type))
    .map((g) => ({ type: g.type, value: scaleLabel(g.value) ? gradeNumber(g.value) : null }))
    .filter((p): p is { type: string; value: number } => p.value !== null);
  if (points.length < 2) return null;
  const delta = points[points.length - 1].value - points[0].value;
  return { points, delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same' };
}

/** Group protocol rows by "Termin" preserving Lectio's order (newest first). */
export function groupByTerm(rows: Array<Record<string, string>>) {
  const terms = new Map<string, Array<Record<string, string>>>();
  for (const row of rows) {
    const term = row.Termin || 'Uden termin';
    if (!terms.has(term)) terms.set(term, []);
    terms.get(term)!.push(row);
  }
  return Array.from(terms, ([term, items]) => ({ term, rows: items }));
}

/** "Dansk A" → { name: "Dansk", level: "A" } */
export function splitLevel(subject: string) {
  const m = subject.match(/^(.*?)\s+([ABC])$/);
  return m ? { name: m[1], level: m[2] } : { name: subject, level: '' };
}
