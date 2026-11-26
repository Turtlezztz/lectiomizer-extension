// Types for the (untyped JS) assignment readers plus the pure logic the
// assignment pages use: grouping, filtering and small label helpers.
import { postbackTarget } from '@/lib/lectio/client';
import { fmtWeekday, relativeDay } from '@/lib/format';

export type StatusKind = 'missing' | 'waiting' | 'delivered' | 'other';

export interface AssignmentItem {
  title: string;
  href: string | null;
  hold: string;
  week: string;
  deadlineText: string;
  deadline: Date | null;
  studentTime: string;
  status: string;
  statusKind: StatusKind;
  absence: string;
  absencePercent: number | null;
  awaiting: string;
  note: string;
  grade: string;
  studentNote: string;
}

export interface AssignmentsData {
  filters: Array<{ label: string; checked: boolean; source: HTMLInputElement }>;
  assignments: AssignmentItem[];
  empty: string | null;
}

export interface LinkInfo {
  label: string;
  href: string;
}

/** Lectio's document chooser: hidden field + postback target (see readDocumentChooser). */
export interface DocumentChooser {
  field: string;
  target: string;
  argument: string;
}

export interface AssignmentData {
  title: string;
  info: Record<string, { text: string; links: LinkInfo[] } | undefined>;
  deadline: Date | null;
  back: Element | null;
  group: {
    members: Array<{ id: string; full: string; name: string; className: string; me: boolean; remove: Element | null }>;
    add: { select: HTMLSelectElement; button: Element; options: Array<{ value: string; label: string }> } | null;
  } | null;
  students: Array<{ name: string; awaiting: string; status: string; finished: boolean | null; grade: string; gradeNote: string; studentNote: string }>;
  entries: Array<{ time: Date | null; timeText: string; user: string; userTitle: string; comment: Element | null; documents: LinkInfo[] }>;
  base: string | null;
  handIn: { comment: HTMLTextAreaElement | null; send: Element | null; upload: Element | null; chooser: DocumentChooser | null; chosen: string } | null;
}

// ------------------------------------------------------------------ grouping

export type Group = 'upcoming' | 'missing' | 'delivered';
export const GROUPS: Array<{ id: Group; title: string }> = [
  { id: 'upcoming', title: 'Kommende' },
  { id: 'missing', title: 'Mangler' },
  { id: 'delivered', title: 'Afleveret' },
];

/** Missing = Lectio says so, or still waiting on the student after the deadline. */
export function groupOf(a: Pick<AssignmentItem, 'statusKind' | 'deadline'>, now = new Date()): Group {
  if (a.statusKind === 'delivered') return 'delivered';
  if (a.statusKind === 'missing') return 'missing';
  if (a.statusKind === 'waiting' && a.deadline && a.deadline.getTime() < now.getTime()) return 'missing';
  return 'upcoming';
}

const time = (d: Date | null, fallback: number) => (d ? d.getTime() : fallback);

/** Upcoming: soonest first (no deadline last). Missing/delivered: most recent first. */
export function sortGroup(items: AssignmentItem[], group: Group): AssignmentItem[] {
  return [...items].sort((a, b) =>
    group === 'upcoming' ? time(a.deadline, Infinity) - time(b.deadline, Infinity) : time(b.deadline, -Infinity) - time(a.deadline, -Infinity),
  );
}

export function matches(a: AssignmentItem, query: string, hold: string): boolean {
  if (hold && a.hold !== hold) return false;
  const q = query.trim().toLocaleLowerCase('da');
  if (!q) return true;
  return [a.title, a.hold, a.note, a.status].join(' ').toLocaleLowerCase('da').includes(q);
}

export function groupAssignments(items: AssignmentItem[], now = new Date()): Record<Group, AssignmentItem[]> {
  const out: Record<Group, AssignmentItem[]> = { upcoming: [], missing: [], delivered: [] };
  for (const a of items) out[groupOf(a, now)].push(a);
  for (const g of Object.keys(out) as Group[]) out[g] = sortGroup(out[g], g);
  return out;
}

export const holdsOf = (items: AssignmentItem[]) => [...new Set(items.map((a) => a.hold).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'da'));

// ------------------------------------------------------------------ labels

/** "4,00" → "4 t", "1,50" → "1,5 t", "4 timer" → "4 t", "" → null */
export function hoursLabel(value: string | undefined | null): string | null {
  const m = String(value || '').match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n === 0) return null;
  return `${String(Math.round(n * 100) / 100).replace('.', ',')} t`;
}

/** "Novelleanalyse.docx (ma 5/10)" → { name: "Novelleanalyse.docx", meta: "ma 5/10", ext: "docx" } */
export function documentLabel(label: string): { name: string; meta: string; ext: string } {
  const m = label.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  const name = (m ? m[1] : label).trim() || 'Dokument';
  const ext = name.match(/\.([a-z0-9]{1,5})$/i)?.[1].toLowerCase() ?? '';
  return { name, meta: m ? m[2] : '', ext };
}

/** "Venter / Fravær: 0%" → { status: "Venter", absence: "0%" } */
export function splitStudentStatus(value = ''): { status: string; absence: string } {
  const [status = '', absence = ''] = value.split(/\s*\/\s*/);
  return { status: status.trim(), absence: absence.replace(/^Fravær:\s*/i, '').trim() };
}

export function kindOfStatus(status: string): StatusKind {
  const s = status.toLowerCase();
  if (/afleveret/.test(s)) return 'delivered';
  if (/mangler/.test(s)) return 'missing';
  if (/venter/.test(s)) return 'waiting';
  return 'other';
}

/** exerciseid from a Lectio assignment href. */
export function exerciseId(href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href).searchParams.get('exerciseid');
  } catch {
    return null;
  }
}

/** "Demo Elev, 3a 12" style name → "Demo Elev"; "Lene Madsen (lm)" → "Lene Madsen" */
export function displayName(value = ''): string {
  return value.replace(/\s*\([^()]*\)\s*$/, '').replace(/,\s*[^,]+$/, '').trim() || value.trim();
}

// ------------------------------------------------------------------ postbacks

/** The event target a Lectio checkbox posts back with (AutoPostBack uses the input's name). */
export function checkboxTarget(input: Element): string {
  const fromScript = postbackTarget(input)?.target;
  if (fromScript) return fromScript;
  const script = input.getAttribute('onclick') || input.getAttribute('onchange') || '';
  const escaped = script.match(/__doPostBack\(\\?['"]([^'"\\]+)\\?['"]/);
  return escaped?.[1] || input.getAttribute('name') || '';
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} kB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Second line under a deadline: relative day when close, else the week number. */
export function deadlineHint(deadline: Date, week: string, now = new Date()): string {
  const days = Math.round((deadline.getTime() - now.getTime()) / 86_400_000);
  if (Math.abs(days) < 14) return relativeDay(deadline, now);
  const w = week.match(/\d+/)?.[0];
  return w ? `Uge ${w}` : fmtWeekday(deadline);
}
