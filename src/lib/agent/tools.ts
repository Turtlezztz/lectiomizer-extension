// The Lectio tools behind TOOL_SPECS. They run wherever the extension has a
// DOM and its Lectio host permission (the app page, Firefox's background page,
// Chrome's offscreen document), fetch pages with the student's own session
// and read them with the same readers as the app's views. The result is
// compact Markdown with ids the next tool takes, instead of whole pages.
//
// v1 converted entire Lectio pages to Markdown inside an open Lectio tab and
// let the model navigate by URL. Now: no Lectio tab needed, one purpose-built
// tool per kind of question, ids instead of URLs, message threads readable,
// schedule weeks fetched in parallel and pages shared between calls.
import { ORIGIN, NotLoggedInError, LectioHttpError, getPage } from '../lectio/client';
import { pageUrl, schoolRoot } from '../lectio/paths';
import { readHome } from '../lectio/readers/home.js';
import { readAssignments } from '../lectio/readers/assignments.js';
import { readAssignment } from '../lectio/readers/assignment.js';
import { readActivity } from '../lectio/readers/activity.js';
import { readGrades } from '../lectio/readers/grades.js';
import { readAbsence } from '../lectio/readers/absence.js';
import { readMessages } from '../lectio/readers/messages.js';
import { readSchedule, isoWeek, weekUrl } from '../lectio/readers/schedule.js';
import { text } from '../lectio/page-data.js';
import { accountContext } from '../sync/read';
import { threadIdOf, threadPath, fold } from '@/features/messages/model';
import { createConverter } from './html-markdown.js';
import { TOOL_SPECS, specOf } from './tool-specs.js';

export const OUTPUT_LIMIT = 40_000;
const MAX_FILE = 20 * 1024 * 1024;

export class ToolError extends Error {}

export interface ToolFile {
  name: string;
  mime: string;
  /** base64 */
  data: string;
  kind: 'image' | 'file';
}

export interface ToolResult {
  ok: boolean;
  /** What the model reads. */
  text: string;
  files?: ToolFile[];
  /** What the chat shows, e.g. "Læste skemaet 3/11–9/11". */
  label: string;
  href?: string | null;
}

export interface ToolOptions {
  schoolId: string;
  /** 'relative': links relative to the school's Lectio root (in-app chat); 'absolute': full URLs (MCP). */
  links?: 'relative' | 'absolute';
  now?: () => Date;
  load?: (url: string) => Promise<Document>;
  download?: (url: string) => Promise<Response>;
}

type Args = Record<string, unknown>;

// ------------------------------------------------------------------ format

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "fre 9/10 kl. 23:59" (year added when it isn't this year). */
export function when(date: Date | null | undefined, now = new Date()): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear() !== now.getFullYear() ? `-${date.getFullYear()}` : '';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}${year} kl. ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const dayHeading = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
};
const clip = (value: string) => (value.length > OUTPUT_LIMIT ? value.slice(0, OUTPUT_LIMIT) + '\n\n[… afkortet]' : value);
const oneLine = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
const join = (parts: Array<string | false | null | undefined | 0>) => parts.filter(Boolean).join(' · ');
const param = (href: string | null | undefined, key: string) => {
  try {
    return href ? new URL(href).searchParams.get(key) : null;
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------ urls

/** Only pages of the student's own school on lectio.dk, and never logging in or out. */
export function resolveUrl(value: unknown, schoolId: string): URL {
  const root = new URL(schoolRoot(schoolId));
  let url: URL;
  try {
    url = new URL(String(value ?? '').trim(), root);
  } catch {
    throw new ToolError('Ugyldig adresse.');
  }
  if (url.hostname === 'lectio.dk') url = new URL(url.href.replace('://lectio.dk', '://www.lectio.dk'));
  if (url.origin !== root.origin || !url.pathname.toLowerCase().startsWith(root.pathname.toLowerCase())) throw new ToolError('Kun sider på din skoles Lectio kan læses.');
  if (/(^|\/)(log(ud|out|ind|in)|logout|login)[^/]*$/i.test(url.pathname)) throw new ToolError('Den side kan ikke læses herfra.');
  url.hash = '';
  return url;
}

const id = (value: unknown, name: string) => {
  const v = String(value ?? '').trim();
  if (!/^[\w-]{1,40}$/.test(v)) throw new ToolError(`Ugyldigt ${name}.`);
  return v;
};

// ------------------------------------------------------------------ files

const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const TEXT_TYPES = new Set(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'html', 'htm']);

function filename(response: Response, url: URL) {
  const header = response.headers.get('content-disposition') || '';
  const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/);
  let name = star ? star[1] : plain ? plain[1] : url.pathname.split('/').pop() || 'dokument';
  try {
    name = decodeURIComponent(name);
  } catch {}
  return name.trim();
}

// FileReader encodes natively; also safe for bytes from another compartment in Firefox.
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      resolve(data.slice(data.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// ------------------------------------------------------------------ tools

export function createLectioTools(options: ToolOptions) {
  const { schoolId } = options;
  const now = options.now ?? (() => new Date());
  const root = schoolRoot(schoolId);
  const absoluteLinks = options.links === 'absolute';
  const short = (href: string) => {
    if (absoluteLinks) return href;
    return href.toLowerCase().startsWith(root.toLowerCase()) ? href.slice(root.length) : href;
  };
  const link = (label: string, href: string | null | undefined) => {
    const name = oneLine(label).replace(/[[\]]/g, '');
    if (!href || !/^https?:/.test(href)) return name;
    return `[${name || 'link'}](${short(href)})`;
  };
  const markdown = createConverter(link);

  // Pages are shared between calls for a minute: a model often reads the same
  // list twice in one answer, and Lectio is slow.
  const pages = new Map<string, { at: number; doc: Promise<Document> }>();
  const fetchPage = options.load ?? getPage;
  function load(url: string): Promise<Document> {
    const hit = pages.get(url);
    if (hit && Date.now() - hit.at < 60_000) return hit.doc;
    const doc = fetchPage(url).catch((error) => {
      pages.delete(url);
      throw error;
    });
    pages.set(url, { at: Date.now(), doc });
    return doc;
  }
  const page = (path: string) => load(pageUrl(schoolId, path));

  let context: Promise<{ scheduleHref: string }> | null = null;
  const ownSchedule = () =>
    (context ??= page('forside.aspx').then((home) => {
      const found = accountContext(home, schoolId);
      return { scheduleHref: found?.scheduleHref || pageUrl(schoolId, 'SkemaNy.aspx') };
    }).catch((error) => {
      context = null;
      throw error;
    }));

  const lessonLine = (l: any, time?: string) => {
    const what = l.title || (l.holds || []).join(', ') || 'Lektion';
    const absid = param(l.href, 'absid');
    const status = l.status === 'cancelled' ? 'AFLYST' : l.status === 'changed' ? 'ÆNDRET' : '';
    const rooms = l.rooms?.length ? l.rooms.join(', ') : l.room;
    return join([
      `${time ? time + ' ' : ''}${l.href ? link(what, l.href) : what}${status ? ` (${status})` : ''}`,
      l.title && (l.holds || []).join(', '),
      l.teachers?.length && `lærer ${l.teachers.join(', ')}`,
      rooms && `lokale ${rooms}`,
      l.homework && 'har lektier',
      l.note && 'har note',
      absid && `lektion-id ${absid}`,
    ]);
  };

  // -------------------------------------------------------------- overview
  async function getOverview(): Promise<Omit<ToolResult, 'ok'>> {
    const doc = await page('forside.aspx');
    const data: any = readHome(doc);
    const out: string[] = [`# Overblik (${dayHeading(isoDate(now()))})`];
    out.push('', '## Skema');
    for (const day of data.days) {
      out.push(`### ${day.label || 'Lektioner'}`);
      out.push(...day.lessons.map((l: any) => `- ${lessonLine(l, l.time ? `${pad(l.time.start.getHours())}:${pad(l.time.start.getMinutes())}–${pad(l.time.end.getHours())}:${pad(l.time.end.getMinutes())}` : '')}`));
    }
    const rows = (block: any, title: string) => {
      if (!block) return;
      out.push('', `## ${block.title || title}${block.info ? ` (${block.info})` : ''}`);
      if (!block.rows.length) out.push('Ingen.');
      for (const r of block.rows) {
        const exercise = param(r.href, 'exerciseid');
        const thread = /beskeder2/i.test(r.href || '') ? param(r.href, 'id') : null;
        const detail = oneLine(r.detail);
        out.push(
          `- ${join([
            r.href ? link(r.text, r.href) : r.text,
            r.sender,
            r.due ? `frist ${when(r.due, now())}` : r.dueText,
            r.important && 'VIGTIG',
            exercise && `opgave-id ${exercise}`,
            thread && `besked-id ${thread}`,
          ])}${detail && detail !== oneLine(r.text) ? `\n  ${detail}` : ''}`,
        );
      }
    };
    rows(data.registrations, 'Fravær uden årsag');
    rows(data.assignments, 'Opgaver');
    rows(data.homework, 'Lektier');
    rows(data.messages, 'Beskeder');
    if (data.notices) {
      out.push('', `## ${data.notices.title || 'Aktuelt'}`);
      for (const r of data.notices.rows) out.push(`- ${r.important ? '**Vigtig:** ' : ''}${(r.node ? markdown(r.node) : r.text).replace(/\n+/g, '\n  ')}`);
    }
    for (const block of data.other) rows(block, block.title);
    return { text: out.join('\n'), label: 'Læste overblikket', href: doc.URL };
  }

  // -------------------------------------------------------------- schedule
  async function getSchedule(args: Args): Promise<Omit<ToolResult, 'ok'>> {
    const today = now();
    const start = typeof args.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.start) ? args.start : null;
    const from = start ? new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10))) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (Number.isNaN(from.getTime())) throw new ToolError('Ugyldig startdato.');
    const count = Math.min(28, Math.max(1, Math.round(Number(args.days) || 7)));
    const dates = Array.from({ length: count }, (_, i) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i));
    const wanted = new Set(dates.map(isoDate));
    const weeks = new Map<string, { week: number; year: number }>();
    for (const d of dates) {
      const w = isoWeek(d);
      weeks.set(`${w.year}-${w.week}`, w);
    }
    const { scheduleHref } = await ownSchedule();
    const failed: string[] = [];
    const lessons: any[] = [];
    await Promise.all(
      Array.from(weeks.values()).map(async (week) => {
        try {
          const doc = await load(weekUrl(scheduleHref, week));
          lessons.push(...readSchedule(doc).filter((l: any) => wanted.has(l.start.slice(0, 10))));
        } catch (error) {
          if (error instanceof NotLoggedInError) throw error;
          failed.push(`uge ${week.week}`);
        }
      }),
    );
    if (failed.length === weeks.size) throw new ToolError('Skemaet kunne ikke læses fra Lectio.');
    const byDay = new Map<string, any[]>();
    for (const l of lessons.sort((a, b) => a.start.localeCompare(b.start))) {
      const key = l.start.slice(0, 10);
      byDay.set(key, [...(byDay.get(key) || []), l]);
    }
    const out = [`# Skema ${isoDate(dates[0])} til ${isoDate(dates.at(-1)!)}`];
    for (const date of Array.from(wanted)) {
      const list = byDay.get(date);
      if (!list) continue;
      out.push('', `## ${dayHeading(date)}`);
      for (const l of list) {
        out.push(`- ${lessonLine(l, `${l.start.slice(11)}–${l.end.slice(11)}`)}`);
        if (l.details) out.push('  ' + oneLine(l.details));
      }
    }
    if (!byDay.size) out.push('', 'Ingen lektioner i perioden.');
    if (failed.length) out.push('', `(${failed.join(', ')} kunne ikke læses.)`);
    const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
    return { text: out.join('\n'), label: `Læste skemaet ${fmt(dates[0])}–${fmt(dates.at(-1)!)}`, href: scheduleHref };
  }

  // -------------------------------------------------------------- assignments
  async function listAssignments(args: Args): Promise<Omit<ToolResult, 'ok'>> {
    const doc = await page('OpgaverElev.aspx');
    const data: any = readAssignments(doc);
    const status = typeof args.status === 'string' ? args.status : 'all';
    const words = typeof args.search === 'string' ? fold(args.search).split(' ').filter(Boolean) : [];
    const t = now().getTime();
    const keep = (a: any) => {
      const done = a.statusKind === 'delivered';
      const overdue = a.statusKind === 'missing' || (!done && a.deadline && a.deadline.getTime() < t);
      if (status === 'open' && (done || overdue)) return false;
      if (status === 'missing' && !overdue) return false;
      if (status === 'handed_in' && !done) return false;
      const hay = fold(`${a.title} ${a.hold}`);
      return words.every((w) => hay.includes(w));
    };
    const list = data.assignments.filter(keep);
    list.sort((a: any, b: any) => (status === 'handed_in' ? -1 : 1) * ((a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0)));
    const out = [`# Opgaver (${status === 'open' ? 'ikke afleveret' : status === 'missing' ? 'mangler' : status === 'handed_in' ? 'afleveret' : 'alle'}): ${list.length} af ${data.assignments.length}`];
    if (!list.length) out.push(data.empty || 'Ingen opgaver matcher.');
    for (const a of list.slice(0, 150)) {
      out.push(
        `- ${join([
          link(a.title, a.href),
          `opgave-id ${param(a.href, 'exerciseid') || '?'}`,
          a.hold,
          `frist ${when(a.deadline, now()) || a.deadlineText || '–'}`,
          `status ${a.status || '–'}`,
          a.studentTime && `elevtid ${a.studentTime}`,
          a.absence && `fravær ${a.absence}`,
          a.awaiting && `afventer ${a.awaiting}`,
          a.grade && `karakter ${a.grade}`,
          a.note && `note: ${oneLine(a.note)}`,
          a.studentNote && `elevnote: ${oneLine(a.studentNote)}`,
        ])}`,
      );
    }
    if (list.length > 150) out.push(`(${list.length - 150} flere er udeladt; søg mere præcist.)`);
    return { text: out.join('\n'), label: 'Læste opgaverne', href: doc.URL };
  }

  async function getAssignment(args: Args): Promise<Omit<ToolResult, 'ok'>> {
    const exercise = id(args.id, 'opgave-id');
    const doc = await page(`ElevAflevering.aspx?exerciseid=${encodeURIComponent(exercise)}`);
    const data: any = readAssignment(doc);
    const out = [`# ${data.title}`, `opgave-id ${exercise}`, ''];
    for (const [label, value] of Object.entries<any>(data.info)) {
      if (label === 'Opgavetitel' || !value) continue;
      const links = value.links.map((l: any) => link(l.label, l.href)).join(', ');
      out.push(`- **${label}:** ${links || oneLine(value.text) || '–'}`);
    }
    if (data.deadline) out.push(`- **Frist:** ${when(data.deadline, now())}`);
    const docs = data.info.Opgavebeskrivelse?.links || [];
    if (docs.length) out.push('', '## Opgavebeskrivelse (læs med read_document)', ...docs.map((l: any) => `- ${link(l.label, l.href)}`));
    if (data.students.length) {
      out.push('', '## Aflevering');
      for (const s of data.students) {
        out.push(`- ${join([s.name, s.status, s.awaiting && `afventer ${s.awaiting}`, s.finished != null && (s.finished ? 'afsluttet' : 'ikke afsluttet'), s.grade && `karakter ${s.grade}`, s.gradeNote && `karakternote: ${s.gradeNote}`, s.studentNote && `elevnote: ${s.studentNote}`])}`);
      }
    }
    if (data.group?.members.length) out.push('', `Gruppe: ${data.group.members.map((m: any) => m.full).join(', ')}`);
    out.push('', `## Indlæg og feedback (${data.entries.length})`);
    for (const e of data.entries) {
      out.push(`- ${join([when(e.time, now()) || e.timeText, e.user])}`);
      const comment = e.comment ? markdown(e.comment) : '';
      if (comment) out.push('  ' + comment.replace(/\n+/g, '\n  '));
      for (const d of e.documents) out.push(`  Dokument: ${link(d.label || 'Dokument', d.href)}`);
    }
    out.push('', data.handIn ? 'Afleveringen er åben; eleven afleverer selv i Lectiomizer eller Lectio.' : 'Afleveringen er lukket.');
    return { text: out.join('\n'), label: `Læste ${data.title}`, href: doc.URL };
  }

  // -------------------------------------------------------------- lesson
  async function getLesson(args: Args): Promise<Omit<ToolResult, 'ok'>> {
    const absid = id(args.id, 'lektion-id');
    const doc = await page(`aktivitet/aktivitetforside2.aspx?absid=${encodeURIComponent(absid)}`);
    const data: any = readActivity(doc);
    const out = [`# ${data.lesson ? lessonLine(data.lesson) : 'Lektion'}`];
    if (data.lesson?.date || data.lesson?.module) out.push(join([data.lesson.date, data.lesson.module]));
    if (data.note) out.push('', `**Note til lektionen:** ${data.note}`);
    if (data.phases.length) out.push('', `Forløb: ${data.phases.map((p: any) => link(p.label, p.href)).join(', ')}`);
    for (const section of data.sections) {
      out.push('', `## ${section.title || 'Indhold'}`);
      for (const item of section.items) out.push('', markdown(item.node));
    }
    if (!data.sections.length) out.push('', data.empty);
    if (data.extras.length) out.push('', '## Andet', ...data.extras.map((e: any) => `- ${e.href ? link(e.label, e.href) : e.label}`));
    return { text: out.join('\n'), label: `Læste lektionen${data.lesson?.date ? ' ' + data.lesson.date : ''}`, href: doc.URL };
  }

  // -------------------------------------------------------------- messages
  async function listMessages(args: Args): Promise<Omit<ToolResult, 'ok'>> {
    const doc = await page('beskeder2.aspx');
    const data: any = readMessages(doc);
    if (!data.messages) throw new ToolError('Beskedlisten kunne ikke læses.');
    const words = typeof args.search === 'string' ? fold(args.search).split(' ').filter(Boolean) : [];
    const limit = Math.min(100, Math.max(1, Math.round(Number(args.limit) || 30)));
    const rows = data.messages
      .map((m: any, i: number) => ({ m, id: threadIdOf(m, i) }))
      .filter(({ m }: any) => {
        const hay = fold([m.subject, m.sender, m.starter, m.recipients, m.recipientsTitle].join(' '));
        return words.every((w) => hay.includes(w));
      });
    const out = [`# Beskeder: ${data.folder || 'Indbakke'} (${Math.min(limit, rows.length)} af ${rows.length})`];
    if (!rows.length) out.push('Ingen beskeder.');
    for (const { m, id: thread } of rows.slice(0, limit)) {
      out.push(
        `- ${join([
          `${m.unread ? '**ulæst** ' : ''}${m.subject}`,
          /^row\d+$/.test(thread) ? '' : `besked-id ${thread}`,
          `fra ${m.sender}`,
          m.starter && m.starter !== m.sender && `startet af ${m.starter}`,
          m.changed,
          m.recipients && `til ${m.recipients}`,
          m.attachment && 'vedhæftning',
          m.flagged && 'flag',
        ])}`,
      );
    }
    return { text: out.join('\n'), label: 'Læste beskederne', href: doc.URL };
  }

  async function readMessage(args: Args): Promise<Omit<ToolResult, 'ok'>> {
    const thread = id(args.id, 'besked-id');
    const doc = await page(threadPath(thread));
    const data: any = readMessages(doc);
    if (!data.thread) throw new ToolError('Tråden kunne ikke åbnes. Den er måske slettet, eller id\'et passer ikke.');
    const t = data.thread;
    const out = [`# ${t.subject}`, `besked-id ${thread}`];
    const recipients = t.recipients?.length ? t.recipients.map((p: any) => p.full || p.name).join(', ') : t.recipientsText;
    if (recipients) out.push(`Modtagere: ${oneLine(recipients)}`);
    for (const m of t.messages) {
      out.push('', `## ${join([m.sender?.full || m.sender?.name || 'Ukendt', when(m.date, now()) || m.stamp, m.own && 'dig'])}`);
      if (m.title && m.title !== t.subject) out.push(`**${m.title}**`);
      out.push(m.content ? markdown(m.content) : '');
      for (const a of m.attachments) out.push(`- Vedhæftning: ${link(a.name, a.href)}${a.size ? ` (${a.size})` : ''}`);
    }
    return { text: out.join('\n'), label: `Læste beskeden ${t.subject}`, href: pageUrl(schoolId, threadPath(thread)) };
  }

  // -------------------------------------------------------------- grades & absence
  async function getGrades(): Promise<Omit<ToolResult, 'ok'>> {
    const doc = await page('grades/grade_report.aspx');
    const data: any = readGrades(doc);
    const out = ['# Karakterer'];
    if (data.term) out.push(`Skoleår: ${data.term}`);
    out.push(...data.notices.map((n: string) => `> ${n}`));
    out.push('', '## Karakterer i år');
    if (!data.current.subjects.length) out.push(data.current.empty || 'Ingen karakterer.');
    for (const s of data.current.subjects) {
      out.push(`### ${s.subject}${s.hold ? ` (${s.hold})` : ''}`);
      for (const f of s.forms) {
        const grades = f.grades.map((g: any) => `${g.type} ${g.value}${g.final ? ' (endelig)' : ''}${g.weight ? `, vægt ${g.weight}` : ''}${g.extra?.length ? ` (${g.extra.join(', ')})` : ''}`);
        out.push(`- ${f.form || 'Karakter'}: ${grades.join(' → ') || 'ingen'}`);
      }
    }
    for (const d of data.diplomas) {
      if ('error' in d) {
        out.push('', `Et bevis kunne ikke læses: ${d.error}`);
        continue;
      }
      out.push('', `## Bevis: ${d.title}`);
      for (const a of d.averages || []) out.push(`- **${a.label}: ${a.value}**${a.note ? ` (${a.note})` : ''}`);
      for (const line of d.lines) {
        const results = line.results.filter((r: any) => !r.empty).map((r: any) => `${r.label}: ${Object.entries(r.fields).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        if (results.length) out.push(`- ${line.subject}: ${results.join('; ')}`);
      }
    }
    const table = (title: string, t: any) => {
      if (!t || t.error || !t.rows?.length) return;
      out.push('', `## ${title}`, ...t.rows.map((row: any) => `- ${Object.entries(row).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}`));
    };
    table('Karakternoter', data.notes);
    table('Bemærkninger', data.remarks);
    table('Protokollinjer', data.protocol);
    return { text: out.join('\n'), label: 'Læste karaktererne', href: doc.URL };
  }

  async function getAbsence(): Promise<Omit<ToolResult, 'ok'>> {
    const doc = await page('subnav/fravaerelev_fravaersaarsager.aspx');
    const data: any = readAbsence(doc);
    const out = ['# Fravær'];
    if (data.totals.length) out.push('', '## Samlet', ...data.totals.map((t: any) => `- ${t.label}: ${t.value}`));
    const rows = (title: string, table: any) => {
      if (!table) return;
      out.push('', `## ${title} (${table.rows.length})`);
      if (!table.rows.length) out.push(table.empty || 'Ingen.');
      for (const r of table.rows) {
        out.push(`- ${join([r.lesson ? lessonLine(r.lesson) : r.lessonText, r.lesson?.date, `fravær ${r.amount || '–'}`, r.registered && `registreret ${r.registered}`, r.cause ? `årsag: ${r.cause}` : 'mangler årsag', r.comment, r.remark && `bemærkning: ${r.remark}`])}`);
      }
    };
    rows('Mangler fraværsårsag', data.missing);
    rows('Registreret fravær', data.history);
    return { text: out.join('\n'), label: 'Læste fraværet', href: doc.URL };
  }

  // -------------------------------------------------------------- pages & documents
  const pageTitle = (doc: Document) => {
    const title = text(doc.querySelector('[id$="MainTitle"], #MainTitle')) || (doc.title || '').split(' - Lectio')[0];
    return title.split(/\s+-\s+/).pop()!.replace(/\s+/g, ' ').trim() || 'Lectio';
  };

  function pageMarkdown(doc: Document) {
    const main = doc.querySelector('#contenttable') || doc.querySelector('[id$="outerContentFrameDiv"]') || doc.body;
    const tabs = Array.from(doc.querySelectorAll<HTMLAnchorElement>('.ls-subnav2 a[href], .lectioTabToolbar a[href]'))
      .filter((a) => !/^(#|javascript:)/i.test(a.getAttribute('href') || ''))
      .map((a) => link(text(a), a.href));
    const title = pageTitle(doc);
    return { title, text: `# ${title}\nAdresse: ${short(doc.URL)}\n\n${tabs.length ? `Faner: ${tabs.join(', ')}\n\n` : ''}${markdown(main) || '(Siden er tom.)'}` };
  }

  async function readPage(args: Args): Promise<Omit<ToolResult, 'ok'>> {
    const url = resolveUrl(args.url, schoolId);
    const doc = await load(url.href);
    const result = pageMarkdown(doc);
    return { text: result.text, label: `Læste ${result.title}`, href: url.href };
  }

  async function download(url: URL): Promise<Response> {
    let response: Response;
    try {
      response = await (options.download ?? ((href: string) => fetch(href, { credentials: 'include' })))(url.href);
    } catch (error) {
      throw new ToolError(`Lectio kunne ikke nås (${(error as Error)?.message || error}).`);
    }
    if (!response.ok) throw new LectioHttpError(response.status);
    return response;
  }

  async function readDocument(args: Args, depth = 0): Promise<Omit<ToolResult, 'ok'>> {
    const url = resolveUrl(args.url, schoolId);
    const response = await download(url);
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (/text\/html|application\/xhtml/.test(type)) {
      // Some document links open a Lectio page around the file.
      const doc = await (options.load ?? getPage)(url.href);
      const file = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((a) => a.href)
        .find((href) => /ExerciseFileGet|dokumenthent|GetFile|\/res\/|\.(pdf|docx?|pptx?|xlsx?)(\?|$)/i.test(href));
      if (file && file !== url.href && depth < 2) return readDocument({ url: file }, depth + 1);
      const result = pageMarkdown(doc);
      return { text: result.text, label: `Læste ${result.title}`, href: url.href };
    }
    const name = filename(response, url);
    const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const blob = await response.blob();
    const label = `Hentede ${name}`;
    if (blob.size > MAX_FILE) throw new ToolError(`${name} er for stor (${Math.round(blob.size / 1048576)} MB); grænsen er 20 MB.`);
    const intro = `Dokument: ${name} (${Math.max(1, Math.round(blob.size / 1024))} kB) fra ${short(url.href)}`;
    const image = IMAGE_TYPES[ext] || (/^image\/(png|jpeg|gif|webp)$/.test(type) ? type : '');
    if (image) return { text: intro, files: [{ name, mime: image, data: await base64(blob), kind: 'image' }], label, href: url.href };
    if (TEXT_TYPES.has(ext) || /^text\/(plain|csv)/.test(type)) return { text: clip(`${intro}\n\n${await blob.text()}`), label, href: url.href };
    const mime = FILE_TYPES[ext] || (type === 'application/pdf' ? type : '');
    if (!mime) throw new ToolError(`${name} er en filtype, der ikke kan læses (${ext || type || 'ukendt'}).`);
    const fileName = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.pdf`;
    return { text: intro, files: [{ name: fileName, mime, data: await base64(blob), kind: 'file' }], label, href: url.href };
  }

  const handlers: Record<string, (args: Args) => Promise<Omit<ToolResult, 'ok'>>> = {
    get_overview: getOverview,
    get_schedule: getSchedule,
    list_assignments: listAssignments,
    get_assignment: getAssignment,
    get_lesson: getLesson,
    list_messages: listMessages,
    read_message: readMessage,
    get_grades: getGrades,
    get_absence: getAbsence,
    read_page: readPage,
    read_document: (args) => readDocument(args),
  };

  /**
   * Runs one tool. Errors become a result the model can explain, never an
   * exception; an expired Lectio session says so, so the student can log in.
   */
  async function run(name: string, args: Args = {}): Promise<ToolResult> {
    const handler = handlers[name];
    const spec = specOf(name);
    if (!handler || !spec) return { ok: false, text: `Ukendt værktøj: ${name}`, label: `Ukendt værktøj ${name}` };
    try {
      const result = await handler(args && typeof args === 'object' ? args : {});
      return { ok: true, ...result, text: clip(result.text) };
    } catch (error) {
      const message =
        error instanceof NotLoggedInError
          ? 'Lectio-sessionen er udløbet. Eleven skal logge ind på Lectio igen (åbn Lectiomizer), og så spørge igen.'
          : error instanceof ToolError || error instanceof LectioHttpError
            ? error.message
            : `Uventet fejl (${(error as Error)?.name || 'Error'}: ${(error as Error)?.message || error}).`;
      if (!(error instanceof ToolError || error instanceof NotLoggedInError)) console.warn('Lectiomizer:', error);
      return { ok: false, text: `Fejl: ${message}`, label: `${spec.running}: ${message}` };
    }
  }

  return { run, specs: TOOL_SPECS };
}

export type LectioTools = ReturnType<typeof createLectioTools>;
export { ORIGIN };
