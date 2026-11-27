// Drafts of unsent messages and replies: saved locally while typing, offered
// again when the same composer opens, removed on send or discard. Never sent.
import { useCallback, useEffect, useRef } from 'react';
import { DRAFTS, putDraft, type Draft, type Drafts } from './local';
import { updateStored, useStudentStore } from './store';

/** Remove a draft without a mounted composer (a send that finished after the pane closed). */
export const dropDraft = (key: string | null, id: string) => (key ? updateStored<Drafts>(key, {}, (all) => putDraft(all, id, null)).then(() => {}) : Promise.resolve());

export function useDraft(id: string) {
  const store = useStudentStore<Drafts>(DRAFTS, {});
  const key = store.key;
  const pending = useRef<Omit<Draft, 'at'> | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const draft = pending.current;
    if (draft === undefined || !key) return;
    pending.current = undefined;
    updateStored<Drafts>(key, {}, (all) => putDraft(all, id, draft)).catch(() => {});
  }, [key, id]);

  // Write what is pending when the pane closes or the tab goes away.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  /** Save (debounced); an empty draft removes it. */
  const save = useCallback(
    (draft: Omit<Draft, 'at'> | null) => {
      pending.current = draft;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 400);
    },
    [flush],
  );

  /** Forget the draft now (and anything still waiting to be written). */
  const discard = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = undefined;
    return dropDraft(key, id);
  }, [key, id]);

  return {
    /** True once stored drafts have been read. */
    loaded: store.ready,
    /** The stored draft for this composer (read it once, when `loaded` turns true). */
    stored: store.ready ? (store.value[id] ?? null) : null,
    key,
    save,
    discard,
  };
}
