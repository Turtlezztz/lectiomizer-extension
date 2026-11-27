// The lessons of a subject's forløb, read from the forløb pages
// (studieplan/forloeb_vis.aspx?phaseid=). Unlike a hold's schedule, a forløb
// page opens whatever school year the Lectio session shows, and it already
// has every lesson's note, homework and files – so this is how earlier years
// get into the eksamenspakke. Lessons outside any forløb are not on these pages.
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { readPhase } from '@/lib/lectio/readers/studyplan.js';
import { schoolYearOf } from '@/lib/lectio/term';
import { sanitize } from '@/components/RichText';
import { limiter } from '@/features/people/directory';
import { absidFromHref } from '@/features/lesson/lesson-utils';
import type { PhaseData } from '@/features/studyplan/model';
import { toStudyContent, type StudyEntry, type StudyLesson } from './study';
import type { PackField } from './exam-pack';

const limit = limiter(4);
const HOUR = 60 * 60_000;
// Already in the undervisningsbeskrivelse's own header.
const SKIP = /^(hold|fag|lærer|laerer)$/i;

export interface PhaseStudy {
  entries: StudyEntry[];
  /** Fields of the forløb page (Periode, Forløbsbeskrivelse, Skriftligt arbejde…) as sanitised HTML. */
  fields: PackField[];
}

/** Plain data from one forløb page. `render` sanitises a node (RichText's sanitize in the app). */
export function toPhaseStudy(phase: PhaseData, render: (node: Element) => string): PhaseStudy {
  const entries: StudyEntry[] = [];
  let last = new Date(0);
  for (const act of phase.activities) {
    const content = toStudyContent({ lesson: act.lesson, note: act.note, sections: act.sections } as Parameters<typeof toStudyContent>[0], render);
    if (!content) continue;
    const start = act.start ? new Date(act.start) : last;
    last = start;
    const lesson = {
      absid: absidFromHref(act.lesson?.href) ?? act.id,
      startDate: start,
      endDate: act.end ? new Date(act.end) : start,
      holds: act.lesson?.holds ?? [],
      teachers: act.lesson?.teachers ?? [],
      rooms: act.lesson?.room ? [act.lesson.room] : [],
      title: act.lesson?.title || act.title,
      status: act.lesson?.status ?? 'normal',
      href: act.lesson?.href ?? null,
      name: act.title,
    } as unknown as StudyLesson;
    entries.push({ lesson, content });
  }
  const fields: PackField[] = phase.fields.filter((f) => f.node && !SKIP.test(f.label)).map((f) => ({ label: f.label, html: render(f.node!) }));
  if (phase.exercises.length) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    fields.push({ label: 'Opgaver', html: `<ul>${phase.exercises.map((e) => `<li>${esc(e.title)}${e.deadline ? ` – frist ${esc(e.deadline)}` : ''}</li>`).join('')}</ul>` });
  }
  return { entries, fields };
}

/** Entries from several sources, once per lesson, oldest first (the first source wins). */
export function mergeEntries(...lists: StudyEntry[][]): StudyEntry[] {
  const seen = new Map<string, StudyEntry>();
  for (const e of lists.flat()) if (!seen.has(e.lesson.absid)) seen.set(e.lesson.absid, e);
  return [...seen.values()].sort((a, b) => a.lesson.startDate.getTime() - b.lesson.startDate.getTime());
}

/** School years (first calendar year) the entries fall in, oldest first. */
export const entryYears = (entries: StudyEntry[]): number[] =>
  [...new Set(entries.filter((e) => e.lesson.startDate.getTime() > 0).map((e) => schoolYearOf(e.lesson.startDate)))].sort((a, b) => a - b);

export function usePhaseStudy(phases: Array<{ id: string }>) {
  const school = useSchoolId();
  const queries = useQueries({
    queries: phases.map((p) => {
      const url = pageUrl(school, `studieplan/forloeb_vis.aspx?phaseid=${encodeURIComponent(p.id)}`);
      return {
        queryKey: ['lectio-phase-study', url],
        queryFn: () => limit(async () => toPhaseStudy(readPhase(await getPage(url)) as PhaseData, (node) => sanitize(node))),
        staleTime: HOUR,
        gcTime: 2 * HOUR,
        retry: 1,
        refetchOnWindowFocus: false,
      };
    }),
  });
  const key = queries.map((q) => q.dataUpdatedAt).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byPhase = useMemo(() => new Map(phases.flatMap((p, i) => (queries[i]?.data ? [[p.id, queries[i].data as PhaseStudy] as const] : []))), [key]);
  const failed = queries.filter((q) => q.isError);
  return {
    byPhase,
    total: queries.length,
    doneCount: queries.filter((q) => !q.isPending).length,
    done: queries.every((q) => !q.isPending),
    failed: failed.length,
    retry: () => failed.forEach((q) => q.refetch()),
  };
}
