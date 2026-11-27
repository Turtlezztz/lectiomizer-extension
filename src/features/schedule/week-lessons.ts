// Lessons of someone else's (or a room's) schedule for a given week, without
// keeping Lectio's whole page around – used for status lists with many rows.
import { useQueries, useQuery, type QueryClient } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';
import { limiter } from '@/features/people/directory';
import { toLessons, type Lesson, type RawLesson } from './lessons';
import { weekDates, dayKey, weekOf, weekParam, weekPath } from './week';

// Many rooms at once: never more than a few requests to Lectio in flight.
const limit = limiter(4);

// Must be a stable reference: useQueries re-runs an inline `select` on every
// render, and a fresh lessons array each time loops React (error #185).
const selectLessons = (raw: RawLesson[]) => toLessons(raw);

function weekQuery(school: string, base: string, at: Date) {
  const ref = weekOf(at);
  const url = pageUrl(school, weekPath(base, ref));
  return {
    queryKey: ['lectio-week-lessons', url],
    queryFn: () => limit(async () => readSchedule(await getPage(url)) as RawLesson[]),
    select: selectLessons,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    meta: { week: weekParam(ref) },
  };
}

export function useWeekLessons(base: string | null, at: Date) {
  const school = useSchoolId();
  return useQuery({ ...weekQuery(school, base || '', at), enabled: !!base });
}

/** One week-lessons query per schedule base path, fetched a few at a time. */
export function useManyWeekLessons(bases: string[], at: Date): Array<{ lessons?: Lesson[]; isPending: boolean; error: unknown }> {
  const school = useSchoolId();
  return useQueries({
    queries: bases.map((base) => weekQuery(school, base, at)),
    combine: (results) => results.map((r) => ({ lessons: r.data, isPending: r.isPending, error: r.error })),
  });
}

/**
 * Raw lessons (readSchedule shape) of the week containing `at`, through the
 * same cache as useWeekLessons. Only lessons dated in that week are returned:
 * Lectio shows another week when it doesn't like ?week=.
 */
export async function fetchWeekRaw(client: QueryClient, school: string, base: string, at: Date): Promise<RawLesson[]> {
  const { select: _select, ...query } = weekQuery(school, base, at);
  const raw = (await client.fetchQuery(query)) as RawLesson[];
  const dates = new Set(weekDates(weekOf(at)).map(dayKey));
  return raw.filter((l) => dates.has(l.start.slice(0, 10)));
}
