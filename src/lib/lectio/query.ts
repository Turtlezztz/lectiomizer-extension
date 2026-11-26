import { QueryClient, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { NotLoggedInError, activate, getPage, postback, type PostbackOptions } from './client';
import { pageUrl } from './paths';
import { useSettings } from '../settings';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof NotLoggedInError) && count < 2,
    },
  },
});

/** A parsed Lectio page plus the reader's data. Keep `doc` for postbacks. */
export interface Loaded<T> {
  doc: Document;
  data: T;
  url: string;
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
      const doc = await getPage(url!);
      return { doc, data: read(doc), url: url! };
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
      const { element, ...options } = input;
      const doc = element ? await activate(loaded.doc, element, options) : await postback(loaded.doc, options);
      return { doc, data: read(doc), url: loaded.url } satisfies Loaded<T>;
    },
    onSuccess: (next) => {
      client.setQueryData(['lectio', loaded!.url, read.name], next);
    },
  });
}
