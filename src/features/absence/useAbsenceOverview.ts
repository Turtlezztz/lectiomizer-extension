import { useQuery } from '@tanstack/react-query';
import { getPage, postback } from '@/lib/lectio/client';
import { readAbsenceOverview } from '@/lib/lectio/readers/absence.js';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import type { AbsenceOverview } from './absence-utils';

/**
 * Lectio's fraværsoversigt (subnav/fravaerelev.aspx) with the module counts. Lectio
 * hides most counts behind "Vis detaljer", a view switch on the page; when it is off,
 * it is switched on with the page's own postback and the answer is read instead.
 */
export function useAbsenceOverview(link: string | null) {
  const school = useSchoolId();
  const url = link && /^https?:/.test(link) ? link : pageUrl(school, 'subnav/fravaerelev.aspx');
  return useQuery<AbsenceOverview>({
    queryKey: ['lectio', url, 'absenceOverviewDetailed'],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const doc = await getPage(url);
      const basic = readAbsenceOverview(doc) as AbsenceOverview;
      const name = basic.detailToggle?.getAttribute('name');
      if (basic.detailed || !name) return basic;
      try {
        const detailed = readAbsenceOverview(await postback(doc, { target: name, fields: { [name]: 'on' } })) as AbsenceOverview;
        return detailed.detailed ? detailed : basic;
      } catch {
        return basic;
      }
    },
  });
}
