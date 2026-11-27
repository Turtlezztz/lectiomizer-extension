// Every week of the student's own schedule in a school year, fetched a few at a
// time (never more than 4 requests in flight). Finished weeks don't change, so
// they are also kept locally and not fetched again next time.
import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';
import { getItem, setItem } from '@/lib/storage';
import { limiter } from '@/features/people/directory';
import type { RawLesson } from '@/features/schedule/lessons';
import { weekParam, weekPath, type WeekRef } from '@/features/schedule/week';
import { inWeek, schoolYearWeeks, slim, weekFinished, type SlimLesson } from './stats';

const limit = limiter(4);

type SavedWeeks = Record<string, SlimLesson[]>;

// Writes of the saved weeks go one after another so none is lost.
let writing: Promise<unknown> = Promise.resolve();
function saveWeek(key: string, week: string, lessons: SlimLesson[]) {
  writing = writing
    .then(async () => {
      const saved = await getItem<SavedWeeks>(key, {});
      await setItem(key, { ...saved, [week]: lessons });
    })
    .catch(() => {});
}

export interface YearLessons {
  weeks: WeekRef[];
  /** Weeks loaded so far (from Lectio or saved). */
  done: number;
  lessons: SlimLesson[] | null;
  /** Weeks that failed (after a retry). */
  failed: number;
  error: unknown;
  retry: () => void;
}

/** `owner` keeps one student's saved weeks apart from another's on the same browser. */
export function useYearLessons(year: number, owner: string | null, enabled: boolean, now: Date): YearLessons {
  const school = useSchoolId();
  const weeks = useMemo(() => schoolYearWeeks(year, now), [year, now.toDateString()]);
  const storeKey = `wrapped-weeks:${school}:${owner ?? '-'}:${year}`;
  const saved = useQuery({
    queryKey: ['wrapped-saved', storeKey],
    queryFn: () => getItem<SavedWeeks>(storeKey, {}),
    enabled,
    staleTime: Infinity,
  });

  const results = useQueries({
    queries: weeks.map((ref) => {
      const id = weekParam(ref);
      const url = pageUrl(school, weekPath(PATHS.schedule, ref));
      const finished = weekFinished(ref, now);
      return {
        queryKey: ['wrapped-week', url],
        enabled: enabled && saved.isSuccess,
        staleTime: finished ? Infinity : 5 * 60_000,
        gcTime: 60 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        queryFn: async (): Promise<SlimLesson[]> => {
          const kept = finished ? saved.data?.[id] : undefined;
          if (kept) return kept;
          const raw = await limit(async () => readSchedule(await getPage(url)) as RawLesson[]);
          const lessons = inWeek(raw, ref).map(slim);
          // Lessons only from other weeks: Lectio showed another week (outside the chosen year) – don't keep that.
          const answeredOtherWeek = raw.length > 0 && lessons.length === 0;
          if (finished && !answeredOtherWeek) saveWeek(storeKey, id, lessons);
          return lessons;
        },
      };
    }),
  });

  const done = results.filter((r) => r.isSuccess).length;
  const failedResults = results.filter((r) => r.isError);
  const complete = done === weeks.length;
  const version = results.map((r) => r.dataUpdatedAt).join();
  const lessons = useMemo(
    () => (complete ? results.flatMap((r) => r.data || []) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [complete, version],
  );
  return {
    weeks,
    done,
    lessons,
    failed: failedResults.length,
    error: failedResults[0]?.error ?? saved.error ?? null,
    retry: () => failedResults.forEach((r) => r.refetch()),
  };
}
