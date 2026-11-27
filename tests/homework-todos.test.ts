import { describe, expect, it } from 'vitest';
import { homeworkKey, mergeTodos, newTodo, pruneTicks, pruneTodos, toggleTick, toggleTodo, type Todo } from '@/features/homework/todo-model';
import type { HomeworkDay, HomeworkRow } from '@/features/homework/model';

const now = new Date(2026, 10, 27, 18, 0);
const LESSON = 'https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=5001';

const todo = (over: Partial<Todo>): Todo => ({ id: Math.random().toString(36), text: 'x', date: null, done: false, createdAt: now.getTime(), ...over });
const day = (date: Date | null, n = 1): HomeworkDay => ({ key: date ? date.toDateString() : '', date, rows: Array.from({ length: n }, () => ({}) as HomeworkRow) });

describe('homework ticks', () => {
  it('keys a lesson by its absid, else its start', () => {
    expect(homeworkKey(LESSON, null)).toBe('l:5001');
    expect(homeworkKey(null, new Date(2026, 10, 30, 8, 15))).toBe(`t:${new Date(2026, 10, 30, 8, 15).getTime()}`);
    expect(homeworkKey(null, null)).toBeNull();
  });
  it('toggles a tick on and off', () => {
    const on = toggleTick({}, 'l:1', new Date(2026, 10, 30), now);
    expect(on).toEqual({ 'l:1': new Date(2026, 10, 30).getTime() });
    expect(toggleTick(on, 'l:1', null, now)).toEqual({});
  });
  it('prunes ticks for lessons more than two weeks ago', () => {
    const ticks = { old: new Date(2026, 10, 1).getTime(), recent: new Date(2026, 10, 20).getTime(), future: new Date(2026, 11, 2).getTime() };
    expect(Object.keys(pruneTicks(ticks, now))).toEqual(['recent', 'future']);
    const kept = { recent: ticks.recent };
    expect(pruneTicks(kept, now)).toBe(kept);
  });
});

describe('to-dos', () => {
  it('creates and toggles a to-do', () => {
    const t = newTodo('  Læs kapitel 3 ', '2026-11-30', now);
    expect(t).toMatchObject({ text: 'Læs kapitel 3', date: '2026-11-30', done: false });
    const [done] = toggleTodo([t], t.id, now);
    expect(done.done).toBe(true);
    expect(done.doneAt).toBe(now.getTime());
    expect(toggleTodo([done], t.id, now)[0]).toMatchObject({ done: false, doneAt: undefined });
  });
  it('prunes finished to-dos a week after their day, never unfinished ones', () => {
    const list = [
      todo({ text: 'old done', date: '2026-11-10', done: true }),
      todo({ text: 'old open', date: '2026-11-10' }),
      todo({ text: 'recent done', date: '2026-11-25', done: true }),
      todo({ text: 'undated done long ago', done: true, doneAt: new Date(2026, 10, 1).getTime() }),
      todo({ text: 'undated done', done: true, doneAt: new Date(2026, 10, 26).getTime() }),
    ];
    expect(pruneTodos(list, now).map((t) => t.text)).toEqual(['old open', 'recent done', 'undated done']);
    const keep = [todo({})];
    expect(pruneTodos(keep, now)).toBe(keep);
  });
  it('merges to-dos into the homework days by date, undated last', () => {
    const mon = new Date(2026, 10, 30, 8, 15);
    const thu = new Date(2026, 11, 3, 14, 30);
    const days = mergeTodos([day(mon, 2), day(thu)], [
      todo({ text: 'monday', date: '2026-11-30' }),
      todo({ text: 'tuesday', date: '2026-12-01' }),
      todo({ text: 'whenever' }),
    ]);
    expect(days.map((d) => [d.date?.getDate() ?? null, d.rows.length, d.todos.map((t) => t.text)])).toEqual([
      [30, 2, ['monday']],
      [1, 0, ['tuesday']],
      [3, 1, []],
      [null, 0, ['whenever']],
    ]);
  });
});
