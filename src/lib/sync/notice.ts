// Text for notices, shared by system notifications (background) and the app.
import { messageTitle } from './changes.js';
import type { Lesson, Notice } from './store';

export const noticeTitle = (notice: Notice): string => messageTitle(notice);

const when = (l: Lesson) => {
  const [y, m, d] = l.start.slice(0, 10).split('-');
  return `${+d}/${+m}-${y} ${l.start.slice(11)}–${l.end.slice(11)}`;
};

export function noticeBody(notice: Notice): string {
  if (notice.item) return notice.item.description || '';
  const l = notice.lesson;
  if (!l) return '';
  return `${when(l)}${l.rooms?.length ? ` · ${l.rooms.join(', ')}` : ''}`;
}

/** Before → after lines for a changed lesson. */
export function noticeChanges(notice: Notice): Array<{ label: string; before: string; after: string }> {
  const { lesson, before } = notice;
  if (!lesson || !before) return [];
  const out: Array<{ label: string; before: string; after: string }> = [];
  if (before.start !== lesson.start || before.end !== lesson.end) out.push({ label: 'Tid', before: when(before), after: when(lesson) });
  for (const [field, label] of [['rooms', 'Lokale'], ['teachers', 'Lærer'], ['holds', 'Hold']] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(lesson[field])) out.push({ label, before: before[field]?.join(', ') || '–', after: lesson[field]?.join(', ') || '–' });
  }
  if (before.title !== lesson.title) out.push({ label: 'Titel', before: before.title || '–', after: lesson.title || '–' });
  if (before.details !== lesson.details) out.push({ label: 'Lektier/note', before: '', after: 'opdateret' });
  return out;
}
