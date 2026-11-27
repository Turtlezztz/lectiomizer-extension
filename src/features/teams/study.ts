// Eksamenslæsning: every note, homework text and file of one hold over the
// school year, gathered from its lesson pages. Lectio spreads this over
// hundreds of pages, so the hold's week schedules (SkemaNy.aspx?type=holdelement)
// are read first to find the lessons with content (their tooltip lists
// "Lektier:", "Note:" or "Øvrigt indhold:"), and only those lessons' pages are
// read (aktivitetforside2.aspx, with readActivity).
import { absidFromHref, asAttachment, type ActivityData, type Attachment } from '@/features/lesson/lesson-utils';
import { detailSections, toLessons, type Lesson, type RawLesson } from '@/features/schedule/lessons';
import { addDays, mondayOf, weekOf, type WeekRef } from '@/features/schedule/week';
import { fold } from '@/features/people/directory';

/** Every ISO week from the one with 1 August to the one with 30 June (Lectio's school year, without the summer holiday). */
export function schoolYearWeeks(year: number): WeekRef[] {
  const first = weekOf(new Date(year, 7, 1));
  const last = mondayOf(weekOf(new Date(year + 1, 5, 30)));
  const out: WeekRef[] = [];
  for (let d = mondayOf(first); d <= last; d = addDays(d, 7)) out.push(weekOf(d));
  return out;
}

export interface StudyLesson extends Lesson {
  absid: string;
}

/** Does the schedule tooltip say the lesson has homework, a note or other content? */
export function hasContent(lesson: Pick<Lesson, 'details' | 'homework' | 'note'>): boolean {
  if (lesson.homework || lesson.note) return true;
  const s = detailSections(lesson.details);
  return !!(s.homework || s.note || s.other);
}

/** The lessons of the given weeks that have content and a lesson page, once each, oldest first. */
export function studyLessons(weeks: Array<RawLesson[] | undefined>): StudyLesson[] {
  const seen = new Map<string, StudyLesson>();
  for (const lesson of toLessons(weeks.flatMap((w) => w ?? []))) {
    const absid = absidFromHref(lesson.href);
    if (!absid || seen.has(absid) || !hasContent(lesson)) continue;
    seen.set(absid, { ...lesson, absid });
  }
  return [...seen.values()].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export interface StudyFile extends Attachment {
  /** Served by Lectio itself (so it can be fetched with the session and zipped). */
  lectio: boolean;
}

export interface StudySection {
  title: string;
  /** Sanitised HTML of each text block. */
  blocks: string[];
}

/** What one lesson page adds to the reading list (plain data, no DOM). */
export interface StudyContent {
  /** Lesson title from the lesson page ("Prøve", "Intro til vektorer"); may be empty. */
  title: string;
  note: string;
  sections: StudySection[];
  files: StudyFile[];
  /** Folded text to search in. */
  search: string;
}

const FILE_HINT = /(dokumenthent|filhent|getfile|download)\.aspx|\/(files?|download)\//i;
const FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|csv|zip|png|jpe?g|gif|heic|mp3|m4a|wav|mp4|mov|ggb|py|ipynb|tns)$/i;

function isLectio(href: string): boolean {
  try {
    return /(^|\.)lectio\.dk$/i.test(new URL(href).hostname);
  } catch {
    return false;
  }
}

/** Links inside a text block that point at a file (Lectio's documents or a URL ending in a file extension). */
export function fileLinksIn(node: Element): Attachment[] {
  const out: Attachment[] = [];
  for (const a of Array.from(node.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
    const href = a.href;
    if (!/^https?:/.test(href)) continue;
    let path = '';
    try {
      path = new URL(href).pathname;
    } catch {
      continue;
    }
    const ext = path.match(FILE_EXT)?.[1]?.toLowerCase() ?? '';
    if (!ext && !FILE_HINT.test(href)) continue;
    const label = (a.textContent || '').replace(/\s+/g, ' ').trim() || decodeURIComponent(path.split('/').pop() || 'Fil');
    out.push({ label, href, ext });
  }
  return out;
}

/**
 * Turn a lesson page into reading-list content. `render` sanitises a block
 * (RichText's sanitize in the app). Returns null when the page has nothing to read.
 */
export function toStudyContent(data: Pick<ActivityData, 'lesson' | 'note' | 'sections'>, render: (node: Element) => string): StudyContent | null {
  const files = new Map<string, StudyFile>();
  const addFile = (f: Attachment) => {
    if (!files.has(f.href)) files.set(f.href, { ...f, lectio: isLectio(f.href) });
  };
  const sections: StudySection[] = [];
  const words: string[] = [data.note];
  for (const s of data.sections) {
    const blocks: string[] = [];
    for (const item of s.items) {
      const file = asAttachment(item.node);
      if (file) {
        addFile(file);
        words.push(file.label);
        continue;
      }
      fileLinksIn(item.node).forEach(addFile);
      const html = render(item.node).trim();
      if (html) blocks.push(html);
      words.push(item.node.textContent || '');
    }
    if (blocks.length) sections.push({ title: s.title, blocks });
  }
  if (!data.note && !sections.length && !files.size) return null;
  const title = data.lesson?.title || '';
  words.push(title, ...data.sections.map((x) => x.title));
  return { title, note: data.note, sections, files: [...files.values()], search: fold(words.join(' ').replace(/\s+/g, ' ')) };
}

export interface StudyEntry {
  lesson: StudyLesson;
  content: StudyContent;
}

/** Entries matching every word of `query` (and having files when `onlyFiles`). */
export function filterStudy(entries: StudyEntry[], query: string, onlyFiles: boolean): StudyEntry[] {
  const words = fold(query).split(' ').filter(Boolean);
  return entries.filter((e) => (!onlyFiles || e.content.files.length > 0) && words.every((w) => e.content.search.includes(w) || fold(e.lesson.name).includes(w)));
}

/** Entries grouped by calendar month ("september 2026"), in order. */
export function groupByMonth(entries: StudyEntry[]): Array<{ key: string; label: string; entries: StudyEntry[] }> {
  const groups: Array<{ key: string; label: string; entries: StudyEntry[] }> = [];
  for (const e of entries) {
    const d = e.lesson.startDate;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: d.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' }), entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }
  return groups;
}

/** Files of the entries for a ZIP: Lectio's own files once each, named "2026-09-14 Opgave.pdf". */
export function zipPlan(entries: StudyEntry[]): Array<{ href: string; name: string; date: Date }> {
  const seen = new Set<string>();
  const out: Array<{ href: string; name: string; date: Date }> = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  for (const e of entries) {
    const d = e.lesson.startDate;
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    for (const f of e.content.files) {
      if (!f.lectio || seen.has(f.href)) continue;
      seen.add(f.href);
      const hasExt = /\.[a-z0-9]{2,5}$/i.test(f.label);
      out.push({ href: f.href, name: `${day} ${f.label}${!hasExt && f.ext ? `.${f.ext}` : ''}`, date: d });
    }
  }
  return out;
}
