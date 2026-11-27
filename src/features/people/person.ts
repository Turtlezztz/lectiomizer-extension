// Who is this? Turns whatever a page knows about a student or teacher (a
// context-card id, "Lene Madsen (lm)", just "lm", or a bare name) into their
// Lectio profile and week schedule, so a person card can show photo, class,
// holds and what they are doing right now.
import { useQuery } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { readProfile } from '@/lib/lectio/readers/profile.js';
import { scheduleTarget } from '@/lib/lectio/readers/directory.js';
import { fmtTime } from '@/lib/format';
import { useWeekLessons } from '@/features/schedule/week-lessons';
import { lessonsOnDay, occupancyAt } from '@/features/schedule/occupancy';
import { durationText } from '@/features/schedule/DayStrip';
import { splitPerson, type Lesson } from '@/features/schedule/lessons';
import { cardIdOf, fold, loadDirectory, schedulePath, type DirectoryEntry, type DirectoryKind } from './directory';

export type PersonKind = 'elev' | 'laerer';

/** What a page knows about someone. Any one of these is enough to start from. */
export interface PersonRef {
  /** Display name ("Lene Madsen"). */
  name?: string;
  /** Lectio's label with suffixes: "Lene Madsen (lm)", "Anna Andersen (3a 01)". */
  full?: string;
  /** Lectio context-card id: S… student, T… teacher, U… user. */
  id?: string;
  kind?: PersonKind;
}

export interface Profile {
  name: string;
  role: string;
  photo: string | null;
  details: Array<{ label: string; value: string }>;
  links: Array<{ label: string; href: string }>;
}

const CARD = /^[STU]\d+$/;

/** Name, code (class or initials) and a guess at the kind from what we were given. */
export function parseRef(ref: PersonRef): { name: string; code: string; kind: PersonKind | null; card: string } {
  const card = CARD.test(ref.id || '') ? ref.id! : '';
  const raw = (ref.full || ref.name || '').replace(/\s+/g, ' ').trim();
  // "Jonathan Hansen(k) (1x 17)": the last group is the class/initials, "(k)" marks a contact person.
  const groups = [...raw.matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim()).filter((g) => g !== 'k');
  let code = groups.pop() || '';
  let name = (ref.name || raw.replace(/\s*\([^()]*\)/g, '')).trim();
  // Schedules sometimes only show initials ("lm").
  if (!code && /^[a-zæøå]{1,5}$/.test(name)) {
    code = name;
    name = '';
  }
  let kind: PersonKind | null = ref.kind ?? null;
  if (!kind && card.startsWith('S')) kind = 'elev';
  if (!kind && card.startsWith('T')) kind = 'laerer';
  if (!kind && code) kind = /\d/.test(code) ? 'elev' : 'laerer';
  return { name, code, kind, card };
}

/** The directory entry that matches a person: initials for teachers, else name (and class when known). */
export function findEntry(entries: DirectoryEntry[], p: { name: string; code: string; kind: PersonKind | null }): DirectoryEntry | undefined {
  const code = fold(p.code);
  const cls = code.split(' ')[0];
  if (p.kind === 'laerer' && code) {
    const byCode = entries.filter((e) => fold(e.code) === code);
    if (byCode.length === 1) return byCode[0];
  }
  if (!p.name) return undefined;
  const name = fold(p.name);
  const named = entries.filter((e) => fold(e.name) === name);
  if (named.length <= 1) return named[0];
  return named.find((e) => fold(e.code) === code || fold(e.code) === cls) ?? named[0];
}

/** Lectio's context card for a student (S…), teacher (T…) or user (U…). */
export function useProfile(cardId: string) {
  const school = useSchoolId();
  return useQuery({
    queryKey: ['lectio-profile', school, cardId],
    enabled: !!cardId,
    staleTime: 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
    retry: false,
    queryFn: async () => {
      const url = pageUrl(school, `contextcard/contextcard.aspx?lectiocontextcard=${encodeURIComponent(cardId)}`);
      const doc = await getPage(url);
      return (readProfile as (doc: Document, url: string) => Profile)(doc, doc.URL);
    },
  });
}

function useDirectoryWhen(kind: PersonKind, enabled: boolean) {
  const school = useSchoolId();
  return useQuery({
    queryKey: ['lectio-directory', school, kind],
    queryFn: () => loadDirectory(school, kind),
    enabled,
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Schedule id from the card's own "Skema" link (U… cards have no student/teacher id). */
function targetFromProfile(profile: Profile | undefined): { kind: PersonKind; id: string } | null {
  for (const link of profile?.links ?? []) {
    const t = scheduleTarget(link.href) as { kind: DirectoryKind; id: string } | null;
    if (t && t.kind !== 'lokale') return { kind: t.kind, id: t.id };
  }
  return null;
}

/**
 * Everything the person card shows. Only fetches while `enabled` (the card is
 * open): directory lists when we have no id, then the context card, then their week.
 */
export function usePerson(ref: PersonRef, enabled: boolean, now: Date) {
  const parsed = parseRef(ref);
  const direct = parsed.card && parsed.card[0] !== 'U' ? { kind: parsed.kind!, id: parsed.card.slice(1) } : null;

  // A U… card can tell us who it is through its "Skema" link.
  const first = useProfile(enabled ? parsed.card : '');
  const fromCard = targetFromProfile(first.data);
  const roleKind: PersonKind | null = /lærer/i.test(first.data?.role || '') ? 'laerer' : /elev/i.test(first.data?.role || '') ? 'elev' : null;
  const cardDone = !parsed.card || !first.isPending;

  // Otherwise look them up by initials or name: teachers first (one small list), then students.
  const needLookup = enabled && !direct && !fromCard && cardDone && !!(parsed.name || parsed.code);
  const lookKind = parsed.kind ?? roleKind;
  const teachers = useDirectoryWhen('laerer', needLookup && lookKind !== 'elev');
  const teacher = teachers.data ? findEntry(teachers.data, { ...parsed, kind: 'laerer' }) : undefined;
  const tryStudents = needLookup && lookKind !== 'laerer' && (lookKind === 'elev' || (!teacher && !teachers.isPending));
  const students = useDirectoryWhen('elev', tryStudents);
  const student = students.data ? findEntry(students.data, { ...parsed, kind: 'elev' }) : undefined;
  const entry = teacher ?? student;

  const target = direct ?? fromCard ?? (entry ? { kind: entry.kind as PersonKind, id: entry.id } : null);
  const cardId = parsed.card || (target ? cardIdOf(target.kind, target.id) : '');
  const profile = useProfile(enabled ? cardId : '');
  const base = target ? schedulePath(target.kind, target.id) : null;
  const week = useWeekLessons(enabled ? base : null, now);

  const lookingUp = needLookup && ((lookKind !== 'elev' && teachers.isPending) || (tryStudents && students.isPending));
  return {
    parsed,
    kind: target?.kind ?? lookKind,
    target,
    cardId,
    entry,
    profile,
    week,
    resolving: (!!parsed.card && first.isPending) || lookingUp,
    /** We know their schedule id (so: profile page, "now", holds). */
    found: !!target,
  };
}

/** Status line for "what are they doing now" from their week's lessons. */
export function nowStatus(lessons: Lesson[], now: Date, kind: DirectoryKind) {
  const o = occupancyAt(lessons, now);
  const today = lessonsOnDay(lessons, now);
  const isRoom = kind === 'lokale';
  let title: string;
  let sub = '';
  let lesson: Lesson | null = null;
  if (o.state === 'busy') {
    title = isRoom ? `Optaget til ${fmtTime(o.freeAt)}` : `I undervisning til ${fmtTime(o.freeAt)}`;
    sub = describeLesson(o.lesson, kind);
    lesson = o.lesson;
  } else if (o.next) {
    title = isRoom ? `Ledig i ${durationText(o.freeFor!)}` : `Fri nu · næste kl. ${fmtTime(o.next.startDate)}`;
    sub = `${isRoom ? 'Næste' : ''} ${fmtTime(o.next.startDate)}–${fmtTime(o.next.endDate)} ${describeLesson(o.next, kind)}`.trim();
    lesson = o.next;
  } else {
    title = isRoom ? 'Ledig resten af dagen' : today.length ? 'Færdig for i dag' : 'Ingen moduler i dag';
  }
  return { busy: o.state === 'busy', title, sub, lesson, today };
}

export function describeLesson(l: Lesson, kind: DirectoryKind): string {
  const what = l.hold || l.title;
  if (kind === 'lokale') return [what, l.teachers.map((t) => splitPerson(t).code).join(', ')].filter(Boolean).join(' · ');
  return [what, l.rooms.join(', ')].filter(Boolean).join(' · ');
}

/** Their holds: the card's "Hold" line plus every hold on their schedule this week. */
export function holdsOf(profile: Profile | undefined, lessons: Lesson[] | undefined): string[] {
  const out = new Set<string>();
  for (const d of profile?.details ?? []) if (/^hold$/i.test(d.label)) d.value.split(/\s*[,·]\s*/).forEach((h) => h && out.add(h));
  for (const l of lessons ?? []) if (l.status !== 'cancelled') l.holds.forEach((h) => h && out.add(h));
  return [...out].sort((a, b) => a.localeCompare(b, 'da', { numeric: true }));
}
