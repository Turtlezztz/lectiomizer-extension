import { ORIGIN } from './client';

/** Lectio student pages, relative to /lectio/{school}/. */
export const PATHS = {
  home: 'forside.aspx',
  schedule: 'SkemaNy.aspx',
  assignments: 'OpgaverElev.aspx',
  messages: 'beskeder2.aspx',
  homework: 'material_lektieoversigt.aspx',
  absence: 'subnav/fravaerelev_fravaersaarsager.aspx',
  grades: 'grades/grade_report.aspx',
  documents: 'DokumentOversigt.aspx',
  books: 'BD/UserReservations.aspx',
} as const;

export const schoolRoot = (schoolId: string) => `${ORIGIN}/lectio/${schoolId}/`;
export const pageUrl = (schoolId: string, path: string) => new URL(path, schoolRoot(schoolId)).href;
export const loginUrl = (schoolId: string) => `${ORIGIN}/lectio/${schoolId}/login.aspx`;

/** Turn a Lectio href into an in-app route when we have a view for it, otherwise null. */
export function appRoute(href: string | null | undefined): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, ORIGIN);
  } catch {
    return null;
  }
  if (!/lectio\.dk$/.test(url.hostname)) return null;
  const path = url.pathname.toLowerCase();
  const q = url.searchParams;
  if (/aktivitet\/aktivitetforside2?\.aspx$/.test(path) && q.get('absid')) {
    const tab = q.get('lectab');
    if (tab === 'elevindhold') return `/lesson/${q.get('absid')}/feedback`;
    if (!tab || tab === 'lektier') return `/lesson/${q.get('absid')}`;
  }
  if (/elevaflevering\.aspx$/.test(path) && q.get('exerciseid')) return assignmentRoute(q.get('exerciseid')!, q.get('elevid'));
  if (/skemany\.aspx$/.test(path)) {
    // Lectio links students and teachers both with and without type=…
    const type = (q.get('type') || '').toLowerCase();
    if ((type === 'elev' || !type) && q.get('elevid')) return `/students/${q.get('elevid')}`;
    if ((type === 'laerer' || !type) && q.get('laererid')) return `/teachers/${q.get('laererid')}`;
    if (type === 'lokale' && q.get('id')) return `/rooms/${q.get('id')}`;
  }
  if (/beskeder2\.aspx$/.test(path) && q.get('id')) return `/messages/${q.get('id')}`;
  if (/beskeder2\.aspx$/.test(path)) return '/messages';
  if (/forside\.aspx$/.test(path)) return '/';
  if (/skemany\.aspx$/.test(path) && !q.get('type')) return '/schedule';
  if (/opgaverelev\.aspx$/.test(path)) return '/assignments';
  if (/grade_report\.aspx$/.test(path)) return '/grades';
  if (/fravaerelev(_fravaersaarsager)?\.aspx$/.test(path)) return '/absence';
  return null;
}

/** In-app route for an assignment. Lectio needs the student's elevid to open ElevAflevering.aspx. */
export function assignmentRoute(exerciseId: string, elevId?: string | null): string {
  return `/assignments/${encodeURIComponent(exerciseId)}${elevId ? `?elevid=${encodeURIComponent(elevId)}` : ''}`;
}

/** ElevAflevering.aspx path; without elevid Lectio answers with an error page. */
export function assignmentPath(exerciseId: string, elevId: string): string {
  const q = new URLSearchParams({ elevid: elevId, exerciseid: exerciseId, prevurl: PATHS.assignments });
  return `ElevAflevering.aspx?${q}`;
}
