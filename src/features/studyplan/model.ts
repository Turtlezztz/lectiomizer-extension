// Shapes of readStudyPlan()/readPhase() output + timeline helpers for the studieplan pages.
import type { ActivityItem, ActivityLesson } from '@/features/lesson/lesson-utils';

export interface Phase {
  id: string;
  title: string;
  href: string;
  estimate: string;
  start: Date | null;
  end: Date | null;
}

export interface PlanExercise {
  title: string;
  href: string | null;
  deadline: Date | null;
  studentHours: number | null;
}

export interface PlanHold {
  id: string;
  name: string;
  href: string;
  phases: Phase[];
  exercises: PlanExercise[];
  hours: { total: number | null; norm: number | null } | null;
}

export interface StudyPlanData {
  holds: PlanHold[];
}

export interface PhaseField {
  label: string;
  text: string;
  lines: string[];
  node: Element | null;
}

export interface PhaseActivity {
  id: string;
  lesson: ActivityLesson | null;
  title: string;
  note: string;
  sections: Array<{ title: string; items: ActivityItem[] }>;
  /** ISO start/end from the lesson's tooltip, when it has one. */
  start?: string | null;
  end?: string | null;
}

export interface PhaseData {
  title: string;
  fields: PhaseField[];
  exercises: Array<{ title: string; deadline: string; href: string | null }>;
  activities: PhaseActivity[];
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export type PhaseState = 'past' | 'now' | 'future' | 'unknown';

export function phaseState(phase: Pick<Phase, 'start' | 'end'>, now = new Date()): PhaseState {
  if (!phase.start || !phase.end) return 'unknown';
  const today = startOfDay(now).getTime();
  if (phase.end.getTime() < today) return 'past';
  if (phase.start.getTime() > today) return 'future';
  return 'now';
}

/** 0–1 of the way through a running phase. */
export function phaseProgress(phase: Pick<Phase, 'start' | 'end'>, now = new Date()): number {
  if (!phase.start || !phase.end) return 0;
  const span = phase.end.getTime() + DAY - phase.start.getTime();
  return Math.min(1, Math.max(0, (now.getTime() - phase.start.getTime()) / span));
}

/** What each hold is working on now, plus what comes next. */
export function currentPhases(holds: PlanHold[], now = new Date()): Array<{ hold: PlanHold; phase: Phase; next: Phase | null }> {
  const out: Array<{ hold: PlanHold; phase: Phase; next: Phase | null }> = [];
  for (const hold of holds) {
    const running = hold.phases.filter((p) => phaseState(p, now) === 'now');
    const next = hold.phases.find((p) => phaseState(p, now) === 'future') ?? null;
    for (const phase of running) out.push({ hold, phase, next });
  }
  return out;
}

export interface Timeline {
  start: Date;
  end: Date;
  months: Array<{ date: Date; left: number; width: number }>;
}

/** Span covering every dated phase, rounded out to whole months. */
export function timeline(holds: PlanHold[], now = new Date()): Timeline | null {
  const dates = holds.flatMap((h) => h.phases.flatMap((p) => [p.start, p.end])).filter((d): d is Date => !!d);
  if (!dates.length) return null;
  const min = new Date(Math.min(...dates.map((d) => d.getTime()), now.getTime()));
  const max = new Date(Math.max(...dates.map((d) => d.getTime()), now.getTime()));
  const start = new Date(min.getFullYear(), min.getMonth(), 1);
  const end = new Date(max.getFullYear(), max.getMonth() + 1, 1);
  const total = end.getTime() - start.getTime();
  const months = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    months.push({ date: d, left: (d.getTime() - start.getTime()) / total, width: (next.getTime() - d.getTime()) / total });
  }
  return { start, end, months };
}

/** Left/width (0–1) of a phase on the timeline; null without dates. */
export function place(t: Timeline, phase: Pick<Phase, 'start' | 'end'>): { left: number; width: number } | null {
  if (!phase.start || !phase.end) return null;
  const total = t.end.getTime() - t.start.getTime();
  const left = (phase.start.getTime() - t.start.getTime()) / total;
  const right = (phase.end.getTime() + DAY - t.start.getTime()) / total;
  return { left: Math.max(0, left), width: Math.max(0.004, Math.min(1, right) - Math.max(0, left)) };
}

/** Phases on one hold that overlap get their own lane, so none hide another. */
export function lanes(phases: Phase[]): Phase[][] {
  const out: Phase[][] = [];
  for (const p of phases) {
    if (!p.start || !p.end) continue;
    const lane = out.find((l) => l[l.length - 1].end!.getTime() < p.start!.getTime());
    if (lane) lane.push(p);
    else out.push([p]);
  }
  return out.length ? out : [[]];
}
