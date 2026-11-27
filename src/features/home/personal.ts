// Hooks for local-only, per-student state (src/lib/storage.ts) used by the overview
// and the homework page: pinned countdowns and the overview's card layout.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getItem, onItemChange, setItem } from '@/lib/storage';
import { useAccount, useSchoolId } from '@/lib/lectio/query';
import { addCountdown, DEFAULT_LAYOUT, normalizeLayout, pruneCountdowns, type Countdown, type HomeLayout } from './overview';

/** `base:school:elevid` once the signed-in student is known (null until then). */
export function useStudentKey(base: string): string | null {
  const school = useSchoolId();
  const account = useAccount();
  if (account.isPending) return null;
  return `${base}:${school}:${account.data?.data.elevId ?? 'elev'}`;
}

/**
 * A stored value that follows changes from other tabs. `clean` runs on load and
 * its result is written back when it changed (pruning); `fallback` and `clean`
 * must be stable (module constants).
 */
export function useStoredItem<T>(key: string | null, fallback: T, clean?: (value: T) => T): [T, (fn: (prev: T) => T) => void, boolean] {
  const [state, setState] = useState<{ key: string | null; value: T }>({ key: null, value: fallback });
  const current = useRef(fallback);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    getItem<T>(key, fallback).then((raw) => {
      if (!alive) return;
      const value = clean ? clean(raw ?? fallback) : (raw ?? fallback);
      current.current = value;
      setState({ key, value });
      if (value !== raw) setItem(key, value).catch(() => {});
    });
    const off = onItemChange<T>(key, (v) => {
      current.current = v ?? fallback;
      setState({ key, value: v ?? fallback });
    });
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (fn: (prev: T) => T) => {
      if (!key) return;
      const next = fn(current.current);
      current.current = next;
      setState({ key, value: next });
      setItem(key, next).catch(() => {});
    },
    [key],
  );
  const ready = !!key && state.key === key;
  return [ready ? state.value : fallback, update, ready];
}

const NO_COUNTDOWNS: Countdown[] = [];
const cleanCountdowns = (list: Countdown[]) => pruneCountdowns(list, new Date());

/**
 * Countdowns pinned to the overview. Other pages can pin a deadline too:
 *
 *   const { isPinned, add, removeSource } = usePinnedCountdowns();
 *   isPinned(assignment.href) ? removeSource(assignment.href)
 *     : add({ title: 'SOP', at: due.getTime(), href: assignment.href, source: assignment.href });
 */
export function usePinnedCountdowns() {
  const key = useStudentKey('countdowns');
  const [stored, update, ready] = useStoredItem(key, NO_COUNTDOWNS, cleanCountdowns);
  const countdowns = useMemo(() => pruneCountdowns(stored, new Date()), [stored]);
  return {
    countdowns,
    ready,
    add: (input: Omit<Countdown, 'id'>) => update((list) => addCountdown(list, input)),
    remove: (id: string) => update((list) => list.filter((c) => c.id !== id)),
    removeSource: (source: string) => update((list) => list.filter((c) => c.source !== source)),
    isPinned: (source: string | null | undefined) => !!source && countdowns.some((c) => c.source === source),
  };
}

const LAYOUT_KEY = 'home-layout';
const NO_LAYOUT: Partial<HomeLayout> = {};

/** The overview's card order and hidden cards (per browser, not per student). */
export function useHomeLayout() {
  const [stored, update] = useStoredItem<Partial<HomeLayout>>(LAYOUT_KEY, NO_LAYOUT);
  const layout = useMemo(() => normalizeLayout(stored), [stored]);
  return {
    layout,
    change: (fn: (layout: HomeLayout) => HomeLayout) => update((prev) => fn(normalizeLayout(prev))),
    reset: () => update(() => ({ ...DEFAULT_LAYOUT })),
    isDefault: JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT),
  };
}
