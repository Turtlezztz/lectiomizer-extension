import { useCallback, useEffect, useRef, useState } from 'react';
import { getItem, setItem } from '@/lib/storage';
import { cleanOverrides, type Overrides, type SimValue } from './simulator';

export interface SimState {
  overrides: Overrides;
  /** As typed, fx "10,0". */
  target: string;
}

const EMPTY: SimState = { overrides: {}, target: '' };

/**
 * The simulator's guesses, kept in local extension storage per student (`key`) and never
 * sent anywhere. With no key yet (account still loading) they live in memory only.
 */
export function useGradeSim(key: string | null) {
  const [state, setState] = useState<SimState>(EMPTY);
  const dirty = useRef(false);

  useEffect(() => {
    if (!key) return;
    let live = true;
    dirty.current = false;
    getItem<Partial<SimState> | null>(key, null).then((saved) => {
      if (live && !dirty.current && saved) setState({ overrides: cleanOverrides(saved.overrides), target: typeof saved.target === 'string' ? saved.target : '' });
    });
    return () => {
      live = false;
    };
  }, [key]);

  useEffect(() => {
    if (key && dirty.current) void setItem(key, state);
  }, [key, state]);

  const change = useCallback((fn: (prev: SimState) => SimState) => {
    dirty.current = true;
    setState(fn);
  }, []);

  const setGrade = useCallback((id: string, value: SimValue | null) => change((prev) => {
    const overrides = { ...prev.overrides };
    if (value) overrides[id] = value;
    else delete overrides[id];
    return { ...prev, overrides };
  }), [change]);

  const setTarget = useCallback((target: string) => change((prev) => ({ ...prev, target })), [change]);
  /** Clears the simulated grades; the target stays. */
  const reset = useCallback(() => change((prev) => ({ ...prev, overrides: {} })), [change]);

  return { ...state, setGrade, setTarget, reset };
}
