import { useEffect, useSyncExternalStore } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient, type Query, type UseQueryOptions } from '@tanstack/react-query';
import { NotLoggedInError, activate, getPage, postback, type PostbackOptions } from './client';
import { pageUrl } from './paths';
import { isUnreachable, loadSavedPage, savePage } from './offline';
import { useSettings } from '../settings';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof NotLoggedInError) && count < 2,
      // Run the first attempt even when the browser says it is offline, so pages
      // can fall back to their saved copy instead of waiting (same as 'online' otherwise).
      networkMode: 'offlineFirst',
    },
    // Always run, so an action tried while offline fails with a message instead of waiting forever.
    mutations: { networkMode: 'always' },
  },
});

/** A parsed Lectio page plus the reader's data. Keep `doc` for postbacks. */
export interface Loaded<T> {
  doc: Document;
  data: T;
  url: string;
  /** Set when Lectio couldn't be reached and this is the last saved copy: actions are unavailable. */
  offline?: { savedAt: number };
}

/** Wait this long for Lectio before showing a saved copy (only when there is one). */
const SLOW_MS = 20_000;

/** The live page, or – when Lectio can't be reached (or is very slow) – its last saved copy. */
async function fetchOrSaved(school: string, url: string): Promise<{ doc: Document; savedAt?: number }> {
  const live = getPage(url);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<'slow'>((resolve) => (timer = setTimeout(() => resolve('slow'), SLOW_MS)));
  try {
    const first = await Promise.race([live, slow]);
    if (first !== 'slow') return { doc: first };
    const saved = await loadSavedPage(school, url);
    if (saved) {
      live.catch(() => {});
      return saved;
    }
    return { doc: await live };
  } catch (error) {
    if (!isUnreachable(error)) throw error;
    const saved = await loadSavedPage(school, url);
    if (!saved) throw error;
    return saved;
  } finally {
    clearTimeout(timer);
  }
}

export function useSchoolId(): string {
  const { settings } = useSettings();
  if (!settings.school) throw new Error('Ingen skole valgt');
  return settings.school.id;
}

/**
 * Fetch a Lectio page (path relative to /lectio/{school}/, or absolute URL) and
 * run a reader over it. The query key is the URL, so the same page is shared.
 */
export function useLectioPage<T>(path: string | null, read: (doc: Document) => T, options?: Partial<UseQueryOptions<Loaded<T>>>) {
  const school = useSchoolId();
  const url = path ? (/^https?:/.test(path) ? path : pageUrl(school, path)) : null;
  return useQuery<Loaded<T>>({
    queryKey: ['lectio', url, read.name],
    enabled: !!url,
    queryFn: async () => {
      const { doc, savedAt } = await fetchOrSaved(school, url!);
      const data = read(doc);
      if (savedAt !== undefined) return { doc, data, url: url!, offline: { savedAt } };
      void savePage(school, url!, doc, readElevId(doc));
      return { doc, data, url: url! };
    },
    ...options,
  });
}

/**
 * Run a Lectio action (postback) against a loaded page. The resulting page is
 * read with the same reader and replaces the cached data, so the UI updates
 * from Lectio's actual response.
 */
export function useLectioAction<T>(loaded: Loaded<T> | undefined, read: (doc: Document) => T) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { element?: Element | null } & PostbackOptions) => {
      if (!loaded) throw new Error('Siden er ikke indlæst endnu');
      if (loaded.offline) throw new Error('Lectio kan ikke nås lige nu, så siden er en gemt kopi. Prøv igen, når du er online.');
      const { element, ...options } = input;
      const doc = element ? await activate(loaded.doc, element, options) : await postback(loaded.doc, options);
      return { doc, data: read(doc), url: loaded.url } satisfies Loaded<T>;
    },
    onSuccess: (next) => {
      client.setQueryData(['lectio', loaded!.url, read.name], next);
    },
  });
}

/** The signed-in student's elevid, read from any Lectio page (null for teachers/other users). */
export function readElevId(doc: Document): string | null {
  const meta = doc.querySelector('meta[name="msapplication-starturl"]')?.getAttribute('content') || '';
  const fromMeta = meta.match(/elevid=(\d+)/i)?.[1];
  if (fromMeta) return fromMeta;
  // Lectio's own navigation links to the student's schedule with ?elevid=… (sometimes with type=elev)
  for (const a of Array.from(doc.querySelectorAll('#s_m_mastermenu a[href], [id$="subnavigator_generic_tr"] a[href], nav a[href]'))) {
    const href = a.getAttribute('href') || '';
    const m = !/type=(?!elev\b)/i.test(href) && href.match(/elevid=(\d+)/i);
    if (m) return m[1];
  }
  return null;
}

const readAccount = (doc: Document) => ({ elevId: readElevId(doc) });

/** Who is signed in (from Forside, cached for the session). */
export function useAccount() {
  return useLectioPage('forside.aspx', readAccount, { staleTime: Infinity, gcTime: Infinity });
}

// ---------------------------------------------------------------- offline

const isOfflineQuery = (q: Query) => !!(q.state.data as Loaded<unknown> | undefined)?.offline && q.getObserversCount() > 0;

/** Oldest saved copy currently on screen, or null when everything shown is live. */
function offlineSince(): number | null {
  let oldest: number | null = null;
  for (const q of queryClient.getQueryCache().getAll()) {
    if (!isOfflineQuery(q)) continue;
    const at = (q.state.data as Loaded<unknown>).offline!.savedAt;
    if (oldest === null || at < oldest) oldest = at;
  }
  return oldest;
}

const subscribeCache = (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange);

/**
 * When pages on screen show saved copies: the time of the oldest one. While
 * that lasts, they are tried again when the browser is back online and every
 * 30 seconds, so the live pages replace them on their own.
 */
export function useOfflineSince(): number | null {
  const since = useSyncExternalStore(subscribeCache, offlineSince, offlineSince);
  const offline = since !== null;
  useEffect(() => {
    if (!offline) return;
    const retry = () => queryClient.invalidateQueries({ predicate: isOfflineQuery });
    const id = setInterval(retry, 30_000);
    window.addEventListener('online', retry);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', retry);
    };
  }, [offline]);
  return since;
}
