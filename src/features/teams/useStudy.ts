// Loads a hold's Eksamenslæsning: the school year's week schedules, then the
// pages of the lessons with content. All requests share one limiter (4 in
// flight), and both steps are TanStack queries, so leaving and reopening the
// view (or the hold) reuses what was read.
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';
import { readActivity } from '@/lib/lectio/readers/activity.js';
import { useTerm } from '@/lib/lectio/useTerm';
import { schoolYearOf } from '@/lib/lectio/term';
import { sanitize } from '@/components/RichText';
import { limiter } from '@/features/people/directory';
import { activityPath, type ActivityData } from '@/features/lesson/lesson-utils';
import type { RawLesson } from '@/features/schedule/lessons';
import { weekPath } from '@/features/schedule/week';
import { schoolYearWeeks, studyLessons, toStudyContent, type StudyContent, type StudyEntry } from './study';
import { teamSchedulePath } from './teams';

const limit = limiter(4);
const HOUR = 60 * 60_000;

export interface StudyProgress {
  entries: StudyEntry[];
  /** Week schedules read / to read. */
  weeksDone: number;
  weeksTotal: number;
  /** Lesson pages read / to read (grows while weeks come in). */
  lessonsDone: number;
  lessonsTotal: number;
  failed: number;
  /** Everything failed, e.g. logged out. */
  error: unknown;
  done: boolean;
  retry: () => void;
  year: number;
}

/** `enabled: false` reads nothing and reports done (for callers that may not have a hold). */
export function useStudy(teamId: string, enabled = true): StudyProgress {
  const school = useSchoolId();
  const year = useTerm()?.year ?? schoolYearOf(new Date());
  const weekUrls = useMemo(() => (enabled ? schoolYearWeeks(year).map((w) => pageUrl(school, weekPath(teamSchedulePath(teamId), w))) : []), [school, teamId, year, enabled]);

  const weeks = useQueries({
    queries: weekUrls.map((url) => ({
      // Same key and data as useWeekLessons, so the cache is shared with other schedule views.
      queryKey: ['lectio-week-lessons', url],
      queryFn: () => limit(async () => readSchedule(await getPage(url)) as RawLesson[]),
      staleTime: HOUR,
      gcTime: 2 * HOUR,
      retry: 1,
      refetchOnWindowFocus: false,
    })),
  });

  const weekData = weeks.map((w) => w.data);
  // Only changes when a week arrives, not on every render.
  const weekKey = weeks.map((w) => w.dataUpdatedAt).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lessons = useMemo(() => studyLessons(weekData), [weekKey]);

  const pages = useQueries({
    queries: lessons.map((l) => {
      const url = pageUrl(school, activityPath(l.absid));
      return {
        queryKey: ['lectio-study-lesson', url],
        queryFn: () =>
          limit(async () => {
            const data = readActivity(await getPage(url)) as ActivityData;
            // Plain data only: hundreds of parsed pages would be a lot to keep in memory.
            return toStudyContent(data, (node) => sanitize(node));
          }),
        staleTime: HOUR,
        gcTime: 2 * HOUR,
        retry: 1,
        refetchOnWindowFocus: false,
      };
    }),
  });

  const pageKey = pages.map((p) => p.dataUpdatedAt).join();
  const entries = useMemo(
    () =>
      lessons.flatMap((lesson, i) => {
        const content = pages[i]?.data as StudyContent | null | undefined;
        return content ? [{ lesson, content }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, pageKey],
  );

  const weeksDone = weeks.filter((w) => !w.isPending).length;
  const lessonsDone = pages.filter((p) => !p.isPending).length;
  const failedWeeks = weeks.filter((w) => w.isError);
  const failedPages = pages.filter((p) => p.isError);
  const done = weeksDone === weeks.length && lessonsDone === pages.length;
  const allFailed = done && weeks.length > 0 && failedWeeks.length === weeks.length;

  return {
    entries,
    weeksDone,
    weeksTotal: weeks.length,
    lessonsDone,
    lessonsTotal: pages.length,
    failed: failedWeeks.length + failedPages.length,
    error: allFailed ? failedWeeks[0]?.error : null,
    done,
    retry: () => {
      for (const q of [...failedWeeks, ...failedPages]) q.refetch();
    },
    year,
  };
}
