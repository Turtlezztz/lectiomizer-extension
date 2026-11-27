// Holds the student has chosen not to see on their own schedule (clubs, choir…).
// Kept locally; a lesson is hidden only when every hold it belongs to is hidden.
import { compareText } from '@/features/people/directory';

export const HIDDEN_HOLDS_KEY = 'scheduleHiddenHolds';

export function isHiddenLesson(lesson: { holds?: string[] }, hidden: ReadonlySet<string>): boolean {
  const holds = lesson.holds || [];
  return holds.length > 0 && hidden.size > 0 && holds.every((h) => hidden.has(h));
}

/** Splits lessons into what is shown and what is hidden. */
export function splitHidden<T extends { holds?: string[] }>(lessons: T[], hidden: readonly string[]): { shown: T[]; hidden: T[] } {
  const set = new Set(hidden);
  const out = { shown: [] as T[], hidden: [] as T[] };
  for (const l of lessons) (isHiddenLesson(l, set) ? out.hidden : out.shown).push(l);
  return out;
}

/** Every hold in the lessons plus the hidden ones, sorted, for the hide menu. */
export function holdChoices(lessons: Array<{ holds?: string[] }>, hidden: readonly string[]): string[] {
  return Array.from(new Set([...lessons.flatMap((l) => l.holds || []), ...hidden])).sort(compareText);
}

export function toggleHold(hidden: readonly string[], hold: string): string[] {
  return hidden.includes(hold) ? hidden.filter((h) => h !== hold) : [...hidden, hold];
}
