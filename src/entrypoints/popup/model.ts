// What the toolbar popup shows, worked out from the snapshot the background
// stores after each check (scheduleHistory). Pure, so it is easy to test.
import { appRoute } from '@/lib/lectio/paths';
import { dayDiff, fmtTime, relativeDay, untilText } from '@/lib/format';
import type { History, Lesson } from '@/lib/sync/store';

/** The popup page as the background passes it to action.setPopup. */
export const POPUP_PATH = 'popup.html';

/** The popup is only used once a school is chosen; before that the button opens onboarding. */
export const usesPopup = (settings: { school?: { id: string } | null; toolbarPopup?: boolean } | null | undefined) =>
  !!settings?.school && settings.toolbarPopup !== false;

export interface NextLesson {
  lesson: Lesson;
  start: Date;
  end: Date;
  /** True while the lesson is running. */
  live: boolean;
  route: string | null;
}

export interface PopupView {
  /** login: the last check found no Lectio session; empty: nothing read yet. */
  state: 'ready' | 'login' | 'empty';
  next: NextLesson | null;
  counts: { messages: number; assignments: number; changes: number };
  checkedAt?: number;
}

/** The running lesson, else the next one that isn't cancelled. */
export function nextLesson(lessons: Lesson[] = [], now = new Date()): NextLesson | null {
  let best: NextLesson | null = null;
  for (const lesson of lessons) {
    if (lesson.status === 'cancelled') continue;
    const start = new Date(lesson.start);
    const end = new Date(lesson.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= now) continue;
    if (!best || start < best.start) best = { lesson, start, end, live: start <= now, route: appRoute(lesson.href) };
  }
  return best;
}

const ASSIGNMENT_KINDS = new Set(['assignment', 'deadline']);
const SCHEDULE_KINDS = new Set(['changed', 'cancelled', 'removed', 'restored', 'room']);

export function popupView(history: History | null | undefined, now = new Date()): PopupView {
  const account = history?.current ? history.accounts?.[history.current] : undefined;
  const counts = { messages: 0, assignments: 0, changes: 0 };
  for (const notice of account?.messages || []) {
    if (notice.read) continue;
    const kind: string = notice.kind;
    if (kind === 'message') counts.messages++;
    else if (ASSIGNMENT_KINDS.has(kind)) counts.assignments++;
    else if (SCHEDULE_KINDS.has(kind)) counts.changes++;
  }
  const status = account?.status;
  const state = status?.login ? 'login' : account?.lessons || account?.feeds ? 'ready' : 'empty';
  return { state, next: nextLesson(account?.lessons, now), counts, checkedAt: status?.checkedAt };
}

/** "slutter om 20 min" while it runs, "om 12 min" later today, else "i morgen kl. 08:15". */
export function whenText(next: NextLesson, now = new Date()): string {
  if (next.live) return `slutter ${untilText(next.end, now)}`;
  if (dayDiff(next.start, now) === 0) return untilText(next.start, now);
  return `${relativeDay(next.start, now)} kl. ${fmtTime(next.start)}`;
}

/** "Tjekket lige nu" / "Tjekket for 12 min siden" / "Tjekket i går kl. 14:05". */
export function checkedText(checkedAt: number | undefined, now = new Date()): string {
  if (!checkedAt) return '';
  const mins = Math.floor((now.getTime() - checkedAt) / 60_000);
  if (mins < 1) return 'Tjekket lige nu';
  if (mins < 60) return `Tjekket for ${mins} min siden`;
  const at = new Date(checkedAt);
  if (dayDiff(at, now) === 0) return `Tjekket kl. ${fmtTime(at)}`;
  return `Tjekket ${relativeDay(at, now)} kl. ${fmtTime(at)}`;
}

/** "Modul" line: the subject (hold) first, the lesson's own title after it. */
export function lessonName(lesson: Lesson): string {
  return [lesson.holds?.join(', '), lesson.title].filter(Boolean).join(' · ') || 'Modul';
}
