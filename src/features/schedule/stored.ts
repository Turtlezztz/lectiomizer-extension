// A value kept in local extension storage (localStorage in dev), live across tabs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getItem, onItemChange, setItem } from '@/lib/storage';

export function useLocalItem<T>(key: string, fallback: T): [T, (next: T | ((current: T) => T)) => void, boolean] {
  const [state, setState] = useState<{ value: T; loaded: boolean }>({ value: fallback, loaded: false });
  const latest = useRef(fallback);
  latest.current = state.value;
  useEffect(() => {
    let alive = true;
    getItem<T>(key, fallback).then((value) => alive && setState({ value, loaded: true }));
    const off = onItemChange<T>(key, (value) => setState({ value: value ?? fallback, loaded: true }));
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      const value = typeof next === 'function' ? (next as (current: T) => T)(latest.current) : next;
      latest.current = value;
      setState({ value, loaded: true });
      void setItem(key, value);
    },
    [key],
  );
  return [state.value, update, state.loaded];
}
