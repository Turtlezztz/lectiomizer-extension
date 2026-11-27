// Persisted homework ticks, own to-dos and the "skjul færdige" toggle (local only, per student).
import { useMemo } from 'react';
import { useStoredItem, useStudentKey } from '@/features/home/personal';
import { newTodo, pruneTicks, pruneTodos, toggleTick, toggleTodo, type Ticks, type Todo } from './todo-model';

const NO_TICKS: Ticks = {};
const NO_TODOS: Todo[] = [];
const cleanTicks = (t: Ticks) => pruneTicks(t, new Date());
const cleanTodos = (t: Todo[]) => pruneTodos(t, new Date());

export function useHomeworkTicks() {
  const key = useStudentKey('homework-done');
  const [ticks, update, ready] = useStoredItem(key, NO_TICKS, cleanTicks);
  return {
    ready,
    count: Object.keys(ticks).length,
    isDone: (k: string | null) => !!k && k in ticks,
    toggle: (k: string | null, when: Date | null) => k && update((t) => toggleTick(t, k, when)),
  };
}

export function useTodos() {
  const key = useStudentKey('todos');
  const [todos, update, ready] = useStoredItem(key, NO_TODOS, cleanTodos);
  return {
    ready,
    todos,
    add: (text: string, date: string | null) => text.trim() && update((list) => [...list, newTodo(text, date)]),
    toggle: (id: string) => update((list) => toggleTodo(list, id)),
    remove: (id: string) => update((list) => list.filter((t) => t.id !== id)),
  };
}

export function useHideDone(): [boolean, (v: boolean) => void] {
  const [hide, update] = useStoredItem<boolean>('homework-hide-done', false);
  return useMemo(() => [hide, (v: boolean) => update(() => v)], [hide, update]);
}
