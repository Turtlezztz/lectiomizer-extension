import { useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getPage } from './client';
import { PATHS, pageUrl } from './paths';
import { queryClient, useSchoolId } from './query';
import { send } from '../sync/hooks';
import { getTerm, isPastTerm, subscribeTerm, switchTerm, type Term } from './term';
import { restoreCurrentFilter } from './assignment-filter';

/** The school year the Lectio session shows, as last seen on a loaded page. */
export function useTerm(): Term | null {
  return useSyncExternalStore(subscribeTerm, getTerm, getTerm);
}

/**
 * Forside, where the app starts, greys the year menu out and lists only the
 * chosen year. Load the schedule page once to learn which years Lectio offers.
 */
export function useTermOptions(): Term | null {
  const school = useSchoolId();
  const term = useTerm();
  useQuery({
    queryKey: ['lectio-term-options', school],
    enabled: !term?.options.length,
    queryFn: async () => {
      await getPage(pageUrl(school, PATHS.schedule));
      return true;
    },
    staleTime: Infinity,
    retry: false,
  });
  return term;
}

/** Everything except the session check and the school list depends on the school year. */
const yearBound = (key: readonly unknown[]) => !['session', 'schools', 'lectio-term-options'].includes(String(key[0]));

/**
 * When the year changes (here or on lectio.dk), every cached Lectio page shows
 * the wrong year: drop them and load the visible ones again.
 */
export function useReloadOnTermChange() {
  const school = useSchoolId();
  useEffect(
    () =>
      subscribeTerm((term, previous) => {
        if (!previous || previous.year === term.year) return;
        // Back in this year: first turn "Vis kun aktuelle" on again if we turned it off.
        const restore = isPastTerm(term) ? Promise.resolve() : restoreCurrentFilter(school).catch(() => {});
        restore.then(() => queryClient.resetQueries({ predicate: (q) => yearBound(q.queryKey) }));
      }),
    [school],
  );
}

export function useSwitchTerm() {
  const school = useSchoolId();
  return useMutation({
    mutationFn: (year: number) => switchTerm(school, year),
    // Pause or resume the background check right away instead of at the next interval.
    onSuccess: () => send({ type: 'check-now' }).catch(() => {}),
  });
}
