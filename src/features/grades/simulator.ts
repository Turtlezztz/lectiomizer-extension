// "Hvad nu hvis": pure maths for the grade simulator. The simulated averages use the
// same weighting as the rest of the page (weightedMean); nothing here leaves the device.
import {
  SCALE, fmtNumber, gradeNumber, isError, latestGrade, parseWeight, scaleLabel, weightedMean, type Diploma, type GradesData, type SubjectGrades, type Weighted,
} from './grade-utils';

/** A grade on the 7-point scale, or "?" = still missing, value unknown. */
export type SimValue = (typeof SCALE)[number] | '?';
export type Overrides = Record<string, SimValue>;

export interface SimItem {
  id: string;
  /** The grade from Lectio, null if not given yet. */
  value: number | null;
  weight: number;
  /** The weight is a guess (no grade yet, so Lectio shows none). */
  assumedWeight: boolean;
}

export const isSimValue = (v: unknown): v is SimValue => v === '?' || (SCALE as readonly unknown[]).includes(v);

/** "Dansk A, mdt.|Eksamenskarakter" – stable across reloads of the same diploma. */
export const diplomaItemId = (subject: string, group: string) => `bevis:${subject}|${group}`;
export const standpunktItemId = (subject: string, hold: string, form: string) => `stp:${subject}|${hold}|${form}`;

/**
 * Every grade cell on the diploma that is (or can become) a 7-point grade. Empty cells
 * get the weight of the line's other result (fx årskarakter ↔ eksamen), else 1.
 * Non-numeric results (Bestået, …) don't count toward the average and are left out.
 */
export function diplomaItems(diploma: Diploma): SimItem[] {
  const items: SimItem[] = [];
  for (const line of diploma.lines) {
    const known = line.results.map((r) => parseWeight(r.fields['Vægt'])).find((w) => w != null) ?? null;
    for (const r of line.results) {
      const raw = r.fields.Karakter;
      const value = r.empty || !raw ? null : scaleLabel(raw) ? gradeNumber(raw) : undefined;
      if (value === undefined) continue;
      const own = parseWeight(r.fields['Vægt']);
      items.push({ id: diplomaItemId(line.subject, r.label), value, weight: own ?? known ?? 1, assumedWeight: own == null });
    }
  }
  return items;
}

/** The latest grade of each subject form – exactly what summarize() averages. */
export function standpunktItems(subjects: SubjectGrades[]): SimItem[] {
  const items: SimItem[] = [];
  for (const s of subjects) {
    for (const f of s.forms) {
      const g = latestGrade(f.grades);
      if (!g || !scaleLabel(g.value)) continue;
      items.push({ id: standpunktItemId(s.subject, s.hold, f.form), value: gradeNumber(g.value), weight: parseWeight(g.weight) ?? 1, assumedWeight: false });
    }
  }
  return items;
}

/** The value an item counts with: the simulated grade, else Lectio's. Null = not counted ("?" or not given). */
export function effectiveValue(item: SimItem, overrides: Overrides): number | null {
  const o = overrides[item.id];
  if (o === '?') return null;
  if (o) return Number(o);
  return item.value;
}

/** Missing grades the user is planning for: marked "?" or filled in where Lectio has none. */
export const isRemaining = (item: SimItem, overrides: Overrides) => overrides[item.id] === '?' || (item.value === null && !!overrides[item.id]);

export interface SimResult {
  /** Without bonus. */
  average: number | null;
  /** The same with the bonus factor applied (null without a factor). */
  withBonus: number | null;
  /** Grades counted. */
  count: number;
  /** Items the user changed (that still exist). */
  changed: number;
}

export function simulate(items: SimItem[], overrides: Overrides, bonus: number | null = null): SimResult {
  const entries: Weighted[] = [];
  let changed = 0;
  for (const item of items) {
    if (overrides[item.id]) changed++;
    const value = effectiveValue(item, overrides);
    if (value !== null) entries.push({ value, weight: item.weight });
  }
  const average = weightedMean(entries);
  return { average, withBonus: average !== null && bonus ? average * bonus : null, count: entries.length, changed };
}

export type TargetResult =
  | { kind: 'none'; reached: boolean | null }
  | { kind: 'secured'; count: number }
  | { kind: 'unreachable'; count: number; best: number }
  | { kind: 'needed'; count: number; average: number };

/**
 * What the remaining grades (see isRemaining) must average for the total to reach `target`.
 * With a bonus factor the target is read as the average *with* bonus (the one used for admission).
 */
export function neededForTarget(items: SimItem[], overrides: Overrides, target: number, bonus: number | null = null): TargetResult {
  const factor = bonus ?? 1;
  const base = target / factor;
  let fixedSum = 0;
  let fixedWeight = 0;
  let restWeight = 0;
  let count = 0;
  for (const item of items) {
    if (isRemaining(item, overrides)) {
      restWeight += item.weight;
      count++;
      continue;
    }
    const value = effectiveValue(item, overrides);
    if (value === null) continue;
    fixedSum += value * item.weight;
    fixedWeight += item.weight;
  }
  if (!count) return { kind: 'none', reached: fixedWeight ? fixedSum / fixedWeight >= base - 1e-9 : null };
  const needed = (base * (fixedWeight + restWeight) - fixedSum) / restWeight;
  if (needed <= -3 + 1e-9) return { kind: 'secured', count };
  if (needed > 12 + 1e-9) return { kind: 'unreachable', count, best: ((fixedSum + 12 * restWeight) / (fixedWeight + restWeight)) * factor };
  return { kind: 'needed', count, average: needed };
}

/**
 * Lectio shows "ekskl. bonus" and "inkl. evt. bonus" but not the factor. Bonus multiplies the
 * result by 1,03 or 1,06 (extra A-levels), so snap the ratio of the two to the nearest of those.
 * Null when there is no "inkl." figure to compare with.
 */
export function bonusFactor(averages: Diploma['averages']): number | null {
  const pick = (re: RegExp) => gradeNumber(averages.find((a) => re.test(a.label))?.value);
  const without = pick(/ekskl/i);
  const withBonus = pick(/inkl/i);
  if (without == null || withBonus == null || without <= 0) return null;
  const ratio = withBonus / without;
  return [1, 1.03, 1.06].reduce((best, f) => (Math.abs(f - ratio) < Math.abs(best - ratio) ? f : best), 1);
}

/** "10,0" / "9.5" → number on the scale's range, else null. */
export function parseTarget(input: string): number | null {
  const n = gradeNumber(input);
  return n !== null && n >= -3 && n <= 12 ? n : null;
}

/** Drop overrides that aren't valid scale values (old or tampered storage). */
export function cleanOverrides(raw: unknown): Overrides {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => isSimValue(v))) as Overrides;
}

export type SimSource =
  | { kind: 'diploma'; diploma: Diploma; items: SimItem[]; bonus: number | null }
  | { kind: 'standpunkt'; items: SimItem[]; bonus: null };

/**
 * What the simulator works on: the eksamensbevis when there is one (that's the average that
 * counts, with Lectio's bonus), else this year's standpunkter. Null when nothing is numeric.
 */
export function simSource(grades: GradesData): SimSource | null {
  const diplomas = grades.diplomas.filter((d): d is Diploma => !isError(d) && d.lines.length > 0);
  const diploma = diplomas.find((d) => d.averages.length) ?? diplomas[0];
  if (diploma) {
    const items = diplomaItems(diploma);
    if (items.length) return { kind: 'diploma', diploma, items, bonus: bonusFactor(diploma.averages) };
  }
  const items = standpunktItems(grades.current.subjects);
  return items.length ? { kind: 'standpunkt', items, bonus: null } : null;
}

const missing = (n: number) => (n === 1 ? 'den manglende karakter' : `de ${n} manglende`);

/** One calm sentence about the target; '' when there's nothing to say. */
export function targetText(input: string, result: TargetResult | null): string {
  if (!input.trim()) return '';
  if (!result) return 'Skriv et snit mellem -3 og 12.';
  switch (result.kind) {
    case 'none':
      if (result.reached === null) return '';
      return result.reached ? 'Nået med karaktererne, som de står.' : 'Ikke nået endnu. Markér manglende karakterer med ? for at se, hvad der skal til.';
    case 'secured':
      return `Sikret, uanset hvad du får i ${missing(result.count)}.`;
    case 'unreachable':
      return `Kan ikke nås – højst ${fmtNumber(result.best)} med 12 i ${missing(result.count)}.`;
    case 'needed':
      // Round up: 9,04 needed is not reached by 9,0.
      return `Kræver ${fmtNumber(Math.ceil(result.average * 10 - 1e-9) / 10)} i snit i ${missing(result.count)}.`;
  }
}
