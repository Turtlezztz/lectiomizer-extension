import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/** True when the app itself has an earlier entry in this tab's history (react-router keeps an index in history.state). */
export const canGoBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

/**
 * "Tilbage": return to wherever the user came from inside the app, or to
 * `fallback` when the page was opened directly (new tab, notification, reload).
 */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  return useCallback(
    (e?: { preventDefault(): void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; button?: number }) => {
      // Let modified clicks open the fallback link in a new tab as usual.
      if (e && (e.metaKey || e.ctrlKey || e.shiftKey || (e.button ?? 0) !== 0)) return;
      e?.preventDefault();
      if (canGoBack()) navigate(-1);
      else navigate(fallback);
    },
    [navigate, fallback],
  );
}
