// Lessons of someone else's (or a room's) schedule for a given week, without
// keeping Lectio's whole page around – used for status lists with many rows.
import { useQueries, useQuery } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';
import { limiter } from '@/features/people/directory';
import { toLessons, type Lesson, type RawLesson } from './lessons';
import { weekOf, weekParam, weekPath } from './week';

// Many rooms at once: never more than a few requests to Lectio in flight.
const limit = limiter(4);

function weekQuery(school: string, base: string, at: Date) {
  const ref = weekOf(at);
  const url = pageUrl(school, weekPath(base, ref));
  return {
    queryKey: ['lectio-week-lessons', url],
    queryFn: () => limit(async () => readSchedule(await getPage(url)) as RawLesson[]),
    select: (raw: RawLesson[]) => toLessons(raw),
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
