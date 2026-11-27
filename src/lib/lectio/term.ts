// The school year (Lectio calls it "term") a Lectio session is showing.
//
// Lectio keeps the chosen year in the session on its server, not in the URL:
// picking 2025/26 in the year menu (s$m$ChooseTerm$term) makes every page show
// that year until it is changed back or the session ends. That holds for the
// pages where the menu is greyed out too (Fraværsårsager, Beskeder' folders,
// Forside's teams), while others always show today (Forside's lessons, Lektier).
// Pages where the menu can be used: Skema (SkemaNy), Studieplan, Fravær,
// Opgaver, Karakterer, Dokumenter, FindSkema and Kalender.
//
// SkemaNy only shows weeks inside the chosen year; any other ?week= gives the
// year's first or last week (week 31) with no lessons.
import { getPage, isFixtureMode, onPageLoaded, postback, postbackTarget } from './client';
import { PATHS, pageUrl } from './paths';

export interface TermOption {
  year: number;
  label: string;
}

export interface Term {
  /** First calendar year of the school year: 2025 is 2025/26. */
  year: number;
  /** Years Lectio offers, newest first. Empty while only a greyed-out menu has been seen. */
  options: TermOption[];
}

const MENU = 'select[id$="ChooseTerm_term"]';

export const termLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;

/** Year menu of a Lectio page; `switchable` is false where Lectio greys it out. */
export function readTerm(doc: Document): (Term & { switchable: boolean }) | null {
  const menu = doc.querySelector<HTMLSelectElement>(MENU);
  if (!menu) return null;
  const options = Array.from(menu.querySelectorAll('option'))
    .map((o) => ({ year: Number(o.getAttribute('value')), label: (o.textContent || '').trim(), selected: o.hasAttribute('selected') }))
    .filter((o) => Number.isInteger(o.year) && o.year > 1900);
  const selected = options.find((o) => o.selected) ?? options[0];
  if (!selected) return null;
  const switchable = !menu.hasAttribute('disabled') && options.length > 1;
  return {
    year: selected.year,
    options: switchable ? options.map(({ year, label }) => ({ year, label: label || termLabel(year) })).sort((a, b) => b.year - a.year) : [],
    switchable,
  };
}

/** The school year a date falls in, with the year starting in August. */
export const schoolYearOf = (date: Date) => (date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1);

/**
 * The year Lectio shows by default: this school year, unless Lectio doesn't
 * offer it yet (early August), then the newest one it does.
 */
export function currentYear(term: Term | null, now = new Date()): number {
  const year = schoolYearOf(now);
  if (!term?.options.length) return Math.max(year, term?.year ?? year);
  if (term.options.some((o) => o.year === year)) return year;
  return Math.max(...term.options.map((o) => o.year).filter((y) => y < year), term.year);
}

/**
 * True when the session shows an earlier year than the current one. Needs the
 * year menu's options (from a page where it can be used) to be sure.
 */
export const isPastTerm = (term: Term | null, now = new Date()) => !!term?.options.length && term.year < currentYear(term, now);

/** The same day of the year in another school year: 27/11-2026 in 2025/26 is 27/11-2025. */
export function sameDayIn(year: number, date: Date): Date {
  const shift = year - schoolYearOf(date);
  const day = new Date(date.getFullYear() + shift, date.getMonth(), date.getDate());
  // 29 February in a year without one becomes 1 March; use the 28th instead.
  return day.getMonth() === date.getMonth() ? day : new Date(date.getFullYear() + shift, date.getMonth() + 1, 0);
}

/** Whether a date lies in a school year (August to July). */
export const inSchoolYear = (year: number, date: Date) => schoolYearOf(date) === year;

/** The Lectio session shows an earlier school year, so a background check would read the wrong year. */
export class PastTermError extends Error {
  constructor(public year: number) {
    super(`Lectio viser skoleåret ${termLabel(year)}. Tjek for nyt er sat på pause, til du skifter tilbage til det nuværende skoleår.`);
    this.name = 'PastTermError';
  }
}

// ---------------------------------------------------------------- session store

let known: Term | null = null;
const listeners = new Set<(term: Term, previous: Term | null) => void>();

/** Remember the year from a loaded page; tell listeners when it differs from before. */
export function noteTerm(doc: Document) {
  const seen = readTerm(doc);
  if (!seen) return;
  const previous = known;
  const options = seen.options.length ? seen.options : previous?.options ?? [];
  const same = (a: TermOption[], b: TermOption[]) => a.map((o) => o.year).join() === b.map((o) => o.year).join();
  if (previous && previous.year === seen.year && same(previous.options, options)) return;
  known = { year: seen.year, options };
  for (const listener of listeners) listener(known, previous);
}

export const getTerm = () => known;

export function subscribeTerm(listener: (term: Term, previous: Term | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

onPageLoaded(noteTerm);

/** Forget the year, e.g. after switching school. */
export function resetTerm() {
  known = null;
}

/**
 * Switch the Lectio session to another school year, the way choosing it in
 * Lectio's year menu does. Every Lectio page (also lectio.dk in other tabs)
 * shows that year afterwards.
 */
export async function switchTerm(schoolId: string, year: number): Promise<Term> {
  if (isFixtureMode()) throw new Error('Skoleåret kan ikke skiftes i demo-tilstand');
  const doc = await getPage(pageUrl(schoolId, PATHS.schedule));
  const menu = doc.querySelector<HTMLSelectElement>(MENU);
  const name = menu?.getAttribute('name');
  if (!menu || !name || menu.hasAttribute('disabled')) throw new Error('Lectio lader dig ikke skifte skoleår');
  if (!readTerm(doc)?.options.some((o) => o.year === year)) throw new Error(`Lectio har ikke skoleåret ${termLabel(year)}`);
  const next = await postback(doc, { target: postbackTarget(menu)?.target || name, argument: '', fields: { [name]: String(year) } });
  const term = readTerm(next);
  if (term?.year !== year) throw new Error(`Lectio skiftede ikke til ${termLabel(year)}`);
  return term;
}
