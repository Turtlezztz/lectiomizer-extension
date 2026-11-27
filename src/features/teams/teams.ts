// Hold: every team at the school (FindSkema.aspx?type=hold, one page per subject)
// and each team's teachers and students (subnav/members.aspx).
import { useQuery } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { readTeamList, readTeamMembers, readTeamSubjects } from '@/lib/lectio/readers/teams.js';
import { compareText, fold, pool } from '@/features/people/directory';

export interface Team {
  id: string;
  /** Lectio's name, e.g. "L1a1 MA", "3a Da". */
  name: string;
  /** Subject code and name from the list it was found in ("MA", "Matematik"). */
  subjectCode: string;
  subject: string;
  href: string;
  /** Lowercased, accent-folded text to search in. */
  search: string;
}

export interface TeamMember {
  kind: 'elev' | 'laerer';
  id: string;
  card: string;
  name: string;
  firstName: string;
  lastName: string;
  /** Teacher initials, or the student's "class nr" ("LGF1 01"). */
  code: string;
  photo: string | null;
  /** Student's studieretning. */
  line: string;
}

export interface TeamMembers {
  title: string;
  teachers: TeamMember[];
  students: TeamMember[];
}

interface RawSubject {
  id: string;
  code: string;
  name: string;
  href: string;
}
interface RawTeam {
  id: string;
  name: string;
  href: string;
  heading: string;
}

export const TEAMS_PATH = 'FindSkema.aspx?type=hold';
export const teamSchedulePath = (id: string) => `SkemaNy.aspx?type=holdelement&holdelementid=${encodeURIComponent(id)}`;
export const teamMembersPath = (id: string) => `subnav/members.aspx?holdelementid=${encodeURIComponent(id)}&showteachers=1&showstudents=1`;
export const teamRoute = (id: string) => `/teams/${encodeURIComponent(id)}`;

/** All current teams at the school, one request per subject (4 at a time). */
export async function loadTeams(school: string): Promise<Team[]> {
  const first = await getPage(pageUrl(school, TEAMS_PATH));
  const subjects = readTeamSubjects(first) as RawSubject[];
  const all = new Map<string, Team>();
  const add = (list: RawTeam[], subject?: RawSubject) => {
    for (const t of list) {
      if (all.has(t.id)) continue;
      // "MA - Matematik" heading when the subject isn't known from the overview.
      const [code, name] = subject ? [subject.code, subject.name] : (t.heading.match(/^(.*?)\s+-\s+(.*)$/)?.slice(1) ?? ['', t.heading]);
      all.set(t.id, { id: t.id, name: t.name, subjectCode: code, subject: name || code, href: t.href, search: fold(`${t.name} ${code} ${name}`) });
    }
  };
  // Some schools may list holds right away instead of by subject.
  add(readTeamList(first) as RawTeam[]);
  const pages = await pool(subjects, 4, async (s) => readTeamList(await getPage(s.href)) as RawTeam[]);
  pages.forEach((p, i) => p.status === 'fulfilled' && add(p.value, subjects[i]));
  if (!all.size) {
    const failed = pages.find((p) => p.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) throw failed.reason;
  }
  return Array.from(all.values());
}

export function useTeams() {
  const school = useSchoolId();
  return useQuery({
    queryKey: ['lectio-teams', school],
    queryFn: () => loadTeams(school),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useTeamMembers(id: string) {
  return useLectioPage(teamMembersPath(id), readTeamMembers as (doc: Document) => TeamMembers, { staleTime: 60 * 60_000 });
}

/** Every word must match. */
export function searchTeams(teams: Team[], query: string): Team[] {
  const words = fold(query).split(' ').filter(Boolean);
  return words.length ? teams.filter((t) => words.every((w) => t.search.includes(w))) : teams;
}

/** Teams grouped by subject, subjects and teams in natural order ("L1a2" before "L1a10"). */
export function groupTeams(teams: Team[]): Array<{ subject: string; code: string; teams: Team[] }> {
  const groups = new Map<string, { subject: string; code: string; teams: Team[] }>();
  for (const t of teams) {
    const key = t.subject || 'Øvrige hold';
    if (!groups.has(key)) groups.set(key, { subject: key, code: t.subjectCode, teams: [] });
    groups.get(key)!.teams.push(t);
  }
  const list = Array.from(groups.values());
  list.forEach((g) => g.teams.sort((a, b) => compareText(a.name, b.name)));
  // "Øvrige hold" last.
  return list.sort((a, b) => Number(/^øvrige/i.test(a.subject)) - Number(/^øvrige/i.test(b.subject)) || compareText(a.subject, b.subject));
}
