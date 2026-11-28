import { useCallback, useEffect, useRef, useState } from 'react';
import { getItem, setItem } from '@/lib/storage';
import { cleanLines, cleanOverrides, customItemId, type CustomLine, type LineSuggestion, type Overrides, type SimValue } from './simulator';

export interface SimState {
  overrides: Overrides;
  /** As typed, fx "10,0". */
  target: string;
  /** Lines added to the diploma (fag der mangler på beviset). */
  added: CustomLine[];
  /** Lectio's lines left out, by subject. */
  removed: string[];
}

const EMPTY: SimState = { overrides: {}, target: '', added: [], removed: [] };
let seq = 0;
const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

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
      if (live && !dirty.current && saved) setState({ overrides: cleanOverrides(saved.overrides), target: typeof saved.target === 'string' ? saved.target : '', ...cleanLines(saved) });
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
  /** Clears the simulated grades and line changes; the target stays. */
  const reset = useCallback(() => change((prev) => ({ ...EMPTY, target: prev.target })), [change]);

  /**
   * Adds lines; a suggestion's standpunkt becomes the first guess for `gradeGroup` (the
   * årskarakter column) and the lower-level lines it replaces are left out.
   */
  const addLines = useCallback((lines: Array<Pick<LineSuggestion, 'subject' | 'weight'> & Partial<LineSuggestion>>, gradeGroup?: string) => change((prev) => {
    const overrides = { ...prev.overrides };
    const removed = new Set(prev.removed);
    const added = [...prev.added];
    for (const l of lines) {
      const id = newId();
      added.push({ id, subject: l.subject, weight: l.weight });
      if (l.grade && gradeGroup) overrides[customItemId(id, gradeGroup)] = l.grade;
      for (const r of l.replaces ?? []) removed.add(r);
    }
    return { ...prev, overrides, added, removed: [...removed] };
  }), [change]);

  const updateLine = useCallback((id: string, patch: Partial<Omit<CustomLine, 'id'>>) => change((prev) => ({
    ...prev, added: prev.added.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  })), [change]);

  const deleteLine = useCallback((id: string) => change((prev) => ({
    ...prev,
    added: prev.added.filter((l) => l.id !== id),
    overrides: Object.fromEntries(Object.entries(prev.overrides).filter(([k]) => !k.startsWith(`egen:${id}|`))),
  })), [change]);

  /** Leave one of Lectio's lines out of the simulated diploma, or put it back. */
  const toggleRemoved = useCallback((subject: string) => change((prev) => ({
    ...prev, removed: prev.removed.includes(subject) ? prev.removed.filter((s) => s !== subject) : [...prev.removed, subject],
  })), [change]);

  return { ...state, setGrade, setTarget, reset, addLines, updateLine, deleteLine, toggleRemoved };
}
