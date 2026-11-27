// Turns readSchedule() output into view-ready lessons and lays out a day.
import { dayKey } from './week';
import { activeSubjectName } from '@/lib/subjects';

export type LessonStatus = 'normal' | 'changed' | 'cancelled';

/** Shape produced by readSchedule (src/lib/lectio/readers/schedule.js). */
export interface RawLesson {
  id: string;
  start: string;
  end: string;
  status: LessonStatus;
  title: string;
  holds: string[];
  teachers: string[];
  rooms: string[];
  details: string;
  href: string | null;
  homework?: boolean;
  note?: boolean;
}

export interface Lesson extends RawLesson {
  startDate: Date;
  endDate: Date;
  day: string;
  /** Minutes since local midnight (end clamped to the same day). */
  startMin: number;
  endMin: number;
  hold: string;
  subject: string;
  /** The module's full name: its hold(s), followed by its own title when it has one ("3a Ma – Prøve"). */
  name: string;
  homeworkText: string;
  noteText: string;
  hasHomework: boolean;
  hasNote: boolean;
}

// Common Danish upper-secondary subject codes as Lectio abbreviates them in hold names.
const SUBJECTS: Record<string, string> = {
  da: 'Dansk', ma: 'Matematik', en: 'Engelsk', fy: 'Fysik', ke: 'Kemi', bi: 'Biologi', bt: 'Bioteknologi',
  hi: 'Historie', sa: 'Samfundsfag', re: 'Religion', ty: 'Tysk', fr: 'Fransk', sp: 'Spansk', it: 'Italiensk',
  ki: 'Kinesisk', ja: 'Japansk', ru: 'Russisk', la: 'Latin', gr: 'Græsk', id: 'Idræt', mu: 'Musik',
  bk: 'Billedkunst', dr: 'Drama', de: 'Design', me: 'Mediefag', ng: 'Naturgeografi', ge: 'Geografi',
  ol: 'Oldtidskundskab', ap: 'Almen sprogforståelse', nv: 'Naturvidenskab', ps: 'Psykologi', fi: 'Filosofi',
  if: 'Informatik', pr: 'Programmering', 'eø': 'Erhvervsøkonomi', ip: 'International økonomi',
  ar: 'Arkitektur', as: 'Astronomi', st: 'Studietid', srp: 'SRP', sro: 'SRO', dho: 'DHO', so: 'Studieområdet',
  kl: 'Klassens time', te: 'Teknologi', tk: 'Teknikfag', vi: 'Virksomhedsøkonomi', af: 'Afsætning',
};

/** "3a Da" → "Dansk", "1x Ma A" → "Matematik", unknown → hold without class prefix. The user's own name wins. */
export function subjectName(hold: string): string {
  const own = activeSubjectName(hold);
  if (own) return own;
  const parts = hold.trim().split(/\s+/).filter(Boolean);
  const rest = parts.length > 1 ? parts.slice(1) : parts;
  const code = (rest[0] || '').toLocaleLowerCase('da');
  return SUBJECTS[code] || rest.join(' ') || hold;
}

/** "Lene Madsen (lm)" → { name: "Lene Madsen", code: "lm" } */
export function splitPerson(value: string): { name: string; code: string } {
  const m = value.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { name: m[1] || m[2], code: m[2] } : { name: value, code: value };
}

/** Splits the tooltip tail ("Lektier:\n- …\n\nNote:\n…") into sections. */
export function detailSections(details: string): { homework: string; note: string; other: string } {
  const out = { homework: [] as string[], note: [] as string[], other: [] as string[] };
  let current: keyof typeof out = 'other';
  for (const line of (details || '').split(/\r?\n/)) {
    const head = line.match(/^\s*(Lektier|Note|Øvrigt indhold)\s*:\s*(.*)$/i);
    if (head) {
      current = /lektier/i.test(head[1]) ? 'homework' : /note/i.test(head[1]) ? 'note' : 'other';
      if (head[2]) out[current].push(head[2]);
      continue;
    }
    out[current].push(line);
  }
  const join = (lines: string[]) => lines.join('\n').trim();
  return { homework: join(out.homework), note: join(out.note), other: join(out.other) };
}

const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function toLesson(raw: RawLesson): Lesson | null {
  const startDate = new Date(raw.start);
  const endDate = new Date(raw.end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const sameDay = dayKey(startDate) === dayKey(endDate);
  const startMin = minutes(startDate);
  const endMin = Math.max(startMin + 10, sameDay ? minutes(endDate) : 24 * 60);
  const hold = raw.holds?.[0] || '';
  const sections = detailSections(raw.details);
  return {
    ...raw,
    holds: raw.holds || [],
    teachers: raw.teachers || [],
    rooms: raw.rooms || [],
    startDate,
    endDate,
    day: dayKey(startDate),
    startMin,
    endMin,
    hold,
    subject: hold ? subjectName(hold) : raw.title || 'Modul',
    name: [(raw.holds || []).map((h: string) => activeSubjectName(h) || h).join(', '), raw.title].filter(Boolean).join(' – ') || 'Modul',
    homeworkText: sections.homework,
    noteText: sections.note,
    hasHomework: raw.homework ?? !!sections.homework,
    hasNote: raw.note ?? !!sections.note,
  };
}

export function toLessons(raw: RawLesson[] | undefined): Lesson[] {
  return (raw || []).map(toLesson).filter((l): l is Lesson => !!l).sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || b.endMin - a.endMin);
}

export interface Placed<T> {
  item: T;
  col: number;
  cols: number;
}

/**
 * Side-by-side layout for overlapping events. Events that (transitively)
 * overlap form a cluster; each gets the first free column, and every event in
 * a cluster shares the cluster's column count.
 */
export function layoutDay<T extends { startMin: number; endMin: number }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let columns: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const p of cluster) p.cols = columns.length;
    out.push(...cluster);
    cluster = [];
    columns = [];
  };
  for (const item of sorted) {
    if (item.startMin >= clusterEnd) flush();
    let col = columns.findIndex((end) => end <= item.startMin);
    if (col < 0) col = columns.push(item.endMin) - 1;
    else columns[col] = item.endMin;
    cluster.push({ item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return out;
}

/** Visible hour range: covers every lesson and at least 08–16. */
export function hourRange(items: Array<{ startMin: number; endMin: number }>, min = 8, max = 16): [number, number] {
  if (!items.length) return [min, max];
  const first = Math.min(...items.map((l) => l.startMin));
  const last = Math.max(...items.map((l) => l.endMin));
  return [Math.max(0, Math.min(min, Math.floor(first / 60))), Math.min(24, Math.max(max, Math.ceil(last / 60)))];
}

/** Most frequent value by key (e.g. the ISO week most lessons fall in). */
export function dominant<T>(values: T[], key: (v: T) => string): T | null {
  const counts = new Map<string, { v: T; n: number }>();
  for (const v of values) {
    const k = key(v);
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { v, n: 1 });
  }
  let best: { v: T; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.v ?? null;
}
