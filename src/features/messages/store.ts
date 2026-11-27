// Local-only state that belongs to one student (drafts, templates, pins, hidden
// questionnaires …). It lives in extension storage via src/lib/storage.ts under
// `<name>:<school>:<elevid>`, so two students on one browser never see each
// other's. Nothing here is sent to Lectio.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getItem, onItemChange, setItem } from '@/lib/storage';
import { useAccount, useSchoolId } from '@/lib/lectio/query';

/** The storage key for `name` for the signed-in student, or null until we know who that is. */
export function useStudentKey(name: string): string | null {
  const school = useSchoolId();
  const account = useAccount();
  if (account.isPending) return null;
  return `${name}:${school}:${account.data?.data.elevId ?? 'elev'}`;
}

/** Read-modify-write outside React (e.g. after a send finishes on an unmounted pane). */
export async function updateStored<T>(key: string, fallback: T, fn: (prev: T) => T): Promise<T> {
  const next = fn(await getItem<T>(key, fallback));
  await setItem(key, next);
  return next;
}

/**
 * A value in storage for the signed-in student. `ready` is false until it has
 * been read; `update` applies a change on top of what is stored right now.
 */
export function useStudentStore<T>(name: string, fallback: T) {
  const key = useStudentKey(name);
  const [state, setState] = useState<{ key: string | null; value: T }>({ key: null, value: fallback });
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    getItem<T>(key, fallbackRef.current).then((value) => alive && setState({ key, value }));
    const off = onItemChange<T>(key, (value) => setState({ key, value: value ?? fallbackRef.current }));
    return () => {
      alive = false;
      off();
    };
  }, [key]);

  const update = useCallback(
    (fn: (prev: T) => T) => {
      if (!key) return;
      setState((s) => (s.key === key ? { key, value: fn(s.value) } : s));
      updateStored(key, fallbackRef.current, fn).catch(() => {});
    },
    [key],
  );

  const ready = !!key && state.key === key;
  return { key, value: ready ? state.value : fallback, ready, update };
}
