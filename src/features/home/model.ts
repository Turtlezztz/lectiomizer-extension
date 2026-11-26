// Typed view of readHome() output plus the small derivations the Home page needs.
import { useEffect, useState } from 'react';
import { parseAssignmentTitle } from '@/lib/lectio/readers/home.js';
import { dayDiff } from '@/lib/format';

export interface Lesson {
  href: string | null;
  module: string;
  room: string;
  status: 'normal' | 'changed' | 'cancelled';
  holds: string[];
  teachers: string[];
  title: string;
  homework: boolean;
  note: boolean;
  time: { start: Date; end: Date } | null;
}
export interface Day { label: string; lessons: Lesson[] }
export interface Row {
  text: string;
  href: string | null;
  detail: string;
  rowTitle: string;
  important: boolean;
  sender: string;
  senderTitle: string;
  due: Date | null;
  dueText: string;
  urgent: boolean;
  node: Element;
}
export interface Block { key: string; title: string; href: string | null; info: string; rows: Row[] }
export interface HomeData {
  days: Day[];
  assignments: Block | null;
  homework: Block | null;
  messages: Block | null;
  notices: Block | null;
  registrations: Block | null;
  groups: Array<{ label: string; href: string }>;
  other: Block[];
  scheduleHref: string;
}

/** Re-render every `ms` with a fresh clock. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Tracks the `.dark` class on <html> so subjectColor() is re-evaluated on theme change. */
export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const SUBJECTS: Record<string, string> = {
  da: 'Dansk', ma: 'Matematik', en: 'Engelsk', fy: 'Fysik', ke: 'Kemi', bi: 'Biologi', hi: 'Historie', sa: 'Samfundsfag',
  re: 'Religion', ty: 'Tysk', fr: 'Fransk', sp: 'Spansk', id: 'Idræt', mu: 'Musik', bk: 'Billedkunst', dr: 'Drama',
  ng: 'Naturgeografi', nv: 'Naturvidenskab', ks: 'Kulturfag', ap: 'Almen sprogforståelse', at: 'Almen studieforberedelse',
  ol: 'Oldtidskundskab', fi: 'Filosofi', ps: 'Psykologi', it: 'Informatik', pr: 'Programmering', ib: 'Innovation', ve: 'Virksomhedsøkonomi',
  af: 'Afsætning', ik: 'International økonomi', ki: 'Kinesisk', la: 'Latin', mt: 'Mediefag', bt: 'Bioteknologi', gs: 'Geovidenskab',
  sr: 'Studieretning', mf: 'Matematik', st: 'Studietid', kl: 'Klassens time',
};

/** "3a Da" → "Dansk"; unknown subjects fall back to the hold name. */
export function subjectName(hold = ''): string {
  const parts = hold.trim().split(/\s+/);
  const key = (parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '').toLowerCase().replace(/[^a-zæøå]/g, '');
  return SUBJECTS[key] || hold;
}

export const lessonName = (l: Lesson) => l.title || (l.holds[0] ? subjectName(l.holds[0]) : '') || l.module || 'Lektion';

export interface FlatLesson extends Lesson { dayLabel: string; dayIndex: number }

export function flatLessons(days: Day[]): FlatLesson[] {
  return days.flatMap((d, dayIndex) => d.lessons.map((l) => ({ ...l, dayLabel: d.label, dayIndex })));
}

/** The running lesson, or the next one that starts later. */
export function currentOrNext(days: Day[], now: Date): { lesson: FlatLesson; running: boolean } | null {
  const all = flatLessons(days).filter((l) => l.time && l.status !== 'cancelled');
  const running = all.find((l) => l.time!.start <= now && now < l.time!.end);
  if (running) return { lesson: running, running: true };
  const next = all.find((l) => l.time!.start > now);
  return next ? { lesson: next, running: false } : null;
}

/** Index of the day to feature in the timeline: today if shown, else the first day with lessons still to come. */
export function focusDayIndex(days: Day[], now: Date): number {
  const dayOf = (d: Day) => d.lessons.find((l) => l.time)?.time?.start;
  const today = days.findIndex((d) => { const s = dayOf(d); return s && dayDiff(s, now) === 0; });
  if (today >= 0) return today;
  const upcoming = days.findIndex((d) => { const s = dayOf(d); return s && dayDiff(s, now) > 0; });
  return upcoming >= 0 ? upcoming : 0;
}

export type NeedKind = 'absence' | 'assignment' | 'homework';
export interface Need { kind: NeedKind; title: string; context: string; href: string | null; due: Date | null; urgent: boolean }

/** Deadlines, homework and missing absence causes, most urgent first. */
export function needs(data: HomeData): Need[] {
  const items: Need[] = [];
  for (const row of data.registrations?.rows || []) items.push({ kind: 'absence', title: row.text, context: 'Fravær', href: row.href, due: null, urgent: true });
  for (const row of data.assignments?.rows || []) {
    const parsed = parseAssignmentTitle(row.rowTitle) as { hold: string; title: string };
    items.push({ kind: 'assignment', title: parsed.title || row.text, context: parsed.hold, href: row.href, due: row.due, urgent: row.urgent });
  }
  for (const row of data.homework?.rows || []) {
    const full = (row.detail || row.text).replace(/\s+/g, ' ').trim();
    const i = full.indexOf(':');
    items.push({
      kind: 'homework',
      title: (i > 0 ? full.slice(i + 1) : full).replace(/^\s*-\s*/, '').trim(),
      context: i > 0 ? full.slice(0, i) : '',
      href: row.href, due: row.due, urgent: row.urgent,
    });
  }
  const rank = (n: Need) => (n.due ? n.due.getTime() : n.kind === 'absence' ? -Infinity : Infinity);
  return items.sort((a, b) => rank(a) - rank(b));
}

/** "Lene Madsen (lm)" → "Lene Madsen" */
export const cleanName = (s = '') => s.replace(/\s*\(.*?\)\s*/g, ' ').trim() || s;

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'God nat';
  if (h < 10) return 'God morgen';
  if (h < 12) return 'God formiddag';
  if (h < 18) return 'God eftermiddag';
  return 'God aften';
}

export function durationText(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} t ${m} min` : `${h} t`;
}
