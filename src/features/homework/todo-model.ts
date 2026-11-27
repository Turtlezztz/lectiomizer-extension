// Local-only homework state: ticks on Lectio homework and the student's own to-dos.
// Pure functions; the hooks that persist them live in ./store.ts.
import { absidFromHref } from '@/features/lesson/lesson-utils';
import type { HomeworkDay } from './model';

/** Ticked homework: key → when the lesson starts (ms), so old ticks can be pruned. */
export type Ticks = Record<string, number>;

export interface Todo {
  id: string;
  text: string;
  /** Local day "2026-11-30", or null for no date. */
  date: string | null;
  done: boolean;
  doneAt?: number;
  createdAt: number;
}

const DAY = 86_400_000;
/** Ticks are kept this long after their lesson; the homework list only shows coming lessons anyway. */
export const TICK_KEEP_DAYS = 14;
/** Finished to-dos are kept this long after their date (or after being ticked, when undated). */
export const TODO_KEEP_DAYS = 7;

/** Stable id for a lesson's homework, shared by Lektier and Overblik: the lesson's absid, else its start. */
export function homeworkKey(href: string | null | undefined, start: Date | null | undefined): string | null {
  const absid = absidFromHref(href);
  if (absid) return `l:${absid}`;
  return start ? `t:${start.getTime()}` : null;
}

export function toggleTick(ticks: Ticks, key: string, when: Date | null, now = new Date()): Ticks {
  const next = { ...ticks };
  if (key in next) delete next[key];
  else next[key] = (when ?? now).getTime();
  return next;
}

/** Drops ticks for lessons more than TICK_KEEP_DAYS ago. Returns the same object when nothing changed. */
export function pruneTicks(ticks: Ticks, now = new Date()): Ticks {
  const limit = now.getTime() - TICK_KEEP_DAYS * DAY;
  const entries = Object.entries(ticks ?? {});
  const kept = entries.filter(([, at]) => typeof at === 'number' && at >= limit);
  return kept.length === entries.length && ticks ? ticks : Object.fromEntries(kept);
}

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-11-30" → local midnight. */
export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Drops finished to-dos once they are TODO_KEEP_DAYS old. Unfinished ones stay until removed. */
export function pruneTodos(todos: Todo[], now = new Date()): Todo[] {
  const limit = now.getTime() - TODO_KEEP_DAYS * DAY;
  const list = Array.isArray(todos) ? todos : [];
  const kept = list.filter((t) => {
    if (!t.done) return true;
    const at = t.date ? parseDateKey(t.date).getTime() + DAY : (t.doneAt ?? t.createdAt);
    return at >= limit;
  });
  return kept.length === list.length && Array.isArray(todos) ? todos : kept;
}

export function newTodo(text: string, date: string | null, now = new Date()): Todo {
  return { id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), date: date || null, done: false, createdAt: now.getTime() };
}

export const toggleTodo = (todos: Todo[], id: string, now = new Date()): Todo[] =>
  todos.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? undefined : now.getTime() } : t));

export interface PlanDay extends HomeworkDay {
  todos: Todo[];
}

/** Homework days plus the student's to-dos on the same days, by date; undated last. */
export function mergeTodos(days: HomeworkDay[], todos: Todo[]): PlanDay[] {
  const byDate = new Map<string, PlanDay>();
  const out: PlanDay[] = [];
  let undated: PlanDay | null = null;
  for (const day of days) {
    const plan: PlanDay = { ...day, todos: [] };
    if (day.date) byDate.set(dateKey(day.date), plan);
    else undated = plan;
    out.push(plan);
  }
  for (const todo of todos) {
    if (!todo.date) {
      undated ??= { key: '', date: null, rows: [], todos: [] };
      undated.todos.push(todo);
      continue;
    }
    let plan = byDate.get(todo.date);
    if (!plan) {
      plan = { key: `todo-${todo.date}`, date: parseDateKey(todo.date), rows: [], todos: [] };
      byDate.set(todo.date, plan);
      out.push(plan);
    }
    plan.todos.push(todo);
  }
  const dated = out.filter((d) => d.date).sort((a, b) => dateKey(a.date!).localeCompare(dateKey(b.date!)));
  return undated ? [...dated, undated] : dated;
}
