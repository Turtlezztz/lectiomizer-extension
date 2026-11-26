// Data hooks for beskeder2.aspx. The list, an open thread and a new message are
// all the same Lectio page in different states, read by readMessages(); each
// gets its own cache entry (keyed like useLectioPage) so the list stays visible
// next to an open thread and useLectioAction updates the right one.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LectioHttpError,
  NotLoggedInError,
  activate,
  extensionTransport,
  fixtureTransport,
  getPage,
  isFixtureMode,
  isLoginPage,
  parseDocument,
} from '@/lib/lectio/client';
import { useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { pageUrl } from '@/lib/lectio/paths';
import { readMessages } from '@/lib/lectio/readers/messages.js';
import { readProfile } from '@/lib/lectio/readers/profile.js';
import { NEW_ID, composePath, hasPhoto, listPath, parseDirectory, sourcesFromHtml, threadIdOf, threadPath } from './model';
import type { MessagesData, Recipient } from './types';

export const read = readMessages as unknown as (doc: Document) => MessagesData;
export const keyOf = (url: string) => ['lectio', url, read.name] as const;

export function useMessageList(folder: string | null) {
  return useLectioPage<MessagesData>(listPath(folder), read);
}

/** Every message list in the cache (any folder) – used to find the row a thread id came from. */
function cachedLists(client: ReturnType<typeof useQueryClient>, preferred?: string) {
  const all = client
    .getQueriesData<Loaded<MessagesData>>({ queryKey: ['lectio'] })
    .map(([, value]) => value)
    .filter((v): v is Loaded<MessagesData> => !!v?.data && Array.isArray((v.data as MessagesData).messages));
  return all.sort((a, b) => Number(b.url === preferred) - Number(a.url === preferred));
}

/**
 * Open a thread. When its row is in a loaded list we press the row's link
 * (Lectio's own postback, `$LB2$_MC_$_<id>`); otherwise – a deep link from the
 * home page or a notification – the thread's own address is fetched.
 */
export function useThread(id: string | null, listUrl: string) {
  const school = useSchoolId();
  const client = useQueryClient();
  const path = id && id !== NEW_ID ? threadPath(id) : null;
  return useLectioPage<MessagesData>(path, read, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: (count, error) => !(error instanceof NotLoggedInError) && count < 1,
    queryFn: async () => {
      const url = pageUrl(school, path!);
      for (const list of cachedLists(client, listUrl)) {
        const rows = list.data.messages || [];
        const row = rows.find((m, i) => threadIdOf(m, i) === id);
        if (!row?.open) continue;
        try {
          const doc = await activate(list.doc, row.open);
          const data = read(doc);
          if (data.thread) return { doc, data, url };
        } catch (error) {
          if (error instanceof NotLoggedInError) throw error;
        }
        break;
      }
      const doc = await getPage(url);
      const data = read(doc);
      if (!data.thread) throw new Error('Tråden kunne ikke åbnes. Den er måske slettet, eller du har ikke adgang til den.');
      return { doc, data, url };
    },
  });
}

/** GET a Lectio page and keep its raw HTML (parseDocument strips the scripts compose needs). */
async function fetchRaw(url: string) {
  const transport = isFixtureMode() ? fixtureTransport : extensionTransport;
  const res = await transport.request(url);
  if (res.status >= 400) throw new LectioHttpError(res.status);
  return res;
}

let knownSources: Array<{ kind: string; url: string }> = [];
export const recipientSources = () => knownSources;

/** A new message: Lectio's "nybesked" page (the same address its context cards use), else the list's "Ny besked". */
export function useCompose(active: boolean, to: string | null, listUrl: string) {
  const school = useSchoolId();
  const client = useQueryClient();
  const path = active ? composePath(to) : null;
  return useLectioPage<MessagesData>(path, read, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const url = pageUrl(school, path!);
      const res = await fetchRaw(url);
      const doc = parseDocument(res.html, res.url);
      if (isLoginPage(res.url, doc)) throw new NotLoggedInError();
      const sources = sourcesFromHtml(res.html, res.url);
      if (sources.length) knownSources = sources;
      const data = read(doc);
      if (data.compose) return { doc, data, url };
      const list = cachedLists(client, listUrl).find((l) => l.data.actions?.compose);
      if (list) {
        const next = await activate(list.doc, list.data.actions!.compose);
        const nextData = read(next);
        if (nextData.compose) return { doc: next, data: nextData, url };
      }
      throw new Error('Lectio åbnede ikke en ny besked.');
    },
  });
}

/** The people, classes and groups a message can go to (Lectio's cached search lists). */
export function useDirectory(sources: Array<{ kind: string; url: string }>) {
  return useQuery({
    queryKey: ['lectio-recipients', sources.map((s) => s.url).join(' ')],
    enabled: sources.length > 0,
    staleTime: 30 * 60_000,
    retry: 1,
    queryFn: async (): Promise<Recipient[]> => {
      const results = await Promise.allSettled(sources.map(async (s) => parseDirectory((await fetchRaw(s.url)).html, s.kind)));
      const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      if (!items.length) throw new Error('Modtagerne kunne ikke hentes');
      return items;
    },
  });
}

/** A person's photo from their Lectio context card (null when they have none). */
export function usePhoto(id: string | undefined, known?: string | null) {
  const school = useSchoolId();
  const enabled = !known && hasPhoto(id);
  const { data } = useQuery({
    queryKey: ['lectio-photo', school, id],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const doc = await getPage(pageUrl(school, `contextcard/contextcard.aspx?lectiocontextcard=${encodeURIComponent(id!)}`));
      return ((readProfile as any)(doc, doc.URL)?.photo as string | null) ?? null;
    },
  });
  return known || (enabled ? data : null) || null;
}

/**
 * Press a chain of Lectio buttons on a loaded page: each step gets the page
 * the previous one returned and gives back the element (and fields) to post.
 * The final page replaces the cache entry, like useLectioAction.
 */
export function useLectioChain(loaded: Loaded<MessagesData> | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      steps: Array<
        (page: Loaded<MessagesData>) => {
          element: Element | null | undefined;
          fields?: Record<string, string>;
        }
      >,
    ) => {
      if (!loaded) throw new Error('Siden er ikke indlæst endnu');
      let page = loaded;
      for (const step of steps) {
        const { element, fields } = step(page);
        const doc = await activate(page.doc, element, { fields });
        page = { doc, data: read(doc), url: loaded.url };
      }
      return page;
    },
    onSuccess: (next) => client.setQueryData(keyOf(loaded!.url), next),
  });
}

export const fieldName = (el: Element | null | undefined) => el?.getAttribute('name') || '';
