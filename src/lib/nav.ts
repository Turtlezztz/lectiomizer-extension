import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/** True when the app itself has an earlier entry in this tab's history (react-router keeps an index in history.state). */
export const canGoBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

let openedPlain = false;
/**
 * Call once at startup, before the router reads the URL: notes whether the app was
 * opened without a route (toolbar button, bookmark of app.html) rather than on a
 * page (#/…), e.g. a reload, a notification link or Overblik itself.
 */
export function rememberLaunch() {
  openedPlain = !window.location.hash || window.location.hash === '#';
}

/** Whether this page load opened the app without a route (see rememberLaunch). */
export const openedWithoutRoute = () => openedPlain;

/** The launch is over once the index route has rendered: later visits to #/ are deliberate. */
export const forgetLaunch = () => {
  openedPlain = false;
};

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
