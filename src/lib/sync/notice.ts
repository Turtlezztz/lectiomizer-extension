// Text for notices, shared by system notifications (background) and the app.
import { homeworkText } from './changes.js';
import type { Lesson, Notice } from './store';

const nameOf = (lesson: Lesson) => [lesson.holds?.join(', '), lesson.title].filter(Boolean).join(' · ') || 'Modul';
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function noticeTitle(notice: Notice): string {
  const { item, lesson } = notice;
  switch (notice.kind) {
    case 'message':
      return `Ny besked: ${item?.title}`;
    case 'assignment':
      return `Ny aflevering: ${item?.title}`;
    case 'deadline':
      return `${notice.reminder === '2h' ? 'Frist om under 2 timer' : 'Frist inden for et døgn'}: ${item?.title}`;
    case 'grade':
      return `Ny karakter i ${item?.title}: ${item?.value}`;
    case 'absence':
      return `Fravær registreret: ${item?.title}`;
    case 'digest': {
      const n = notice.digest?.lessons ?? 0;
      return `Din dag: ${n === 1 ? '1 modul' : `${n} moduler`}`;
    }
  }
  if (!lesson) return 'Lectio';
  switch (notice.kind) {
    case 'cancelled':
      return `${nameOf(lesson)} er aflyst`;
    case 'removed':
      return `${nameOf(lesson)} er fjernet fra skemaet`;
    case 'restored':
      return `${nameOf(lesson)} er tilbage i skemaet`;
    case 'room':
      return `${nameOf(lesson)} er flyttet til ${lesson.rooms?.join(', ') || 'intet lokale'}`;
    case 'homework':
      return `${homeworkText(lesson.details) ? 'Lektier' : 'Note'} til ${nameOf(lesson)}`;
    default:
      return `${nameOf(lesson)} er ændret`;
  }
}

const when = (l: Lesson) => {
  const [y, m, d] = l.start.slice(0, 10).split('-');
  return `${+d}/${+m}-${y} ${l.start.slice(11)}–${l.end.slice(11)}`;
};

export function noticeBody(notice: Notice): string {
  if (notice.kind === 'deadline' && notice.item?.deadline) {
    const sameDay = new Date(notice.item.deadline).toDateString() === new Date(notice.createdAt).toDateString();
    const hold = notice.item.description?.split(' · ')[0];
    return [hold && !hold.startsWith('Frist') ? hold : '', `Frist ${sameDay ? 'i dag' : 'i morgen'} kl. ${clock(notice.item.deadline)}`].filter(Boolean).join(' · ');
  }
  if (notice.kind === 'digest' && notice.digest) {
    const { first, deadlines } = notice.digest;
    const parts: string[] = [];
    if (first) parts.push(`Første modul ${first.start.slice(11)} ${nameOf(first)}${first.rooms?.length ? ` i ${first.rooms.join(', ')}` : ''}`);
    if (deadlines.length === 1) parts.push(`Aflevering i dag: ${deadlines[0].title} (kl. ${clock(deadlines[0].deadline)})`);
    else if (deadlines.length > 1) parts.push(`${deadlines.length} afleveringer i dag`);
    return parts.join(' · ');
  }
  if (notice.kind === 'grade' && notice.item) return notice.item.type || '';
  if (notice.item) return notice.item.description || '';
  const l = notice.lesson;
  if (!l) return '';
  const base = `${when(l)}${l.rooms?.length ? ` · ${l.rooms.join(', ')}` : ''}`;
  if (notice.kind === 'homework') return `${base}${homeworkText(l.details) ? ` · ${homeworkText(l.details)}` : ''}`;
  return base;
}

/** Before → after lines for a changed lesson. */
export function noticeChanges(notice: Notice): Array<{ label: string; before: string; after: string }> {
  const { lesson, before } = notice;
  if (!lesson || !before || notice.kind === 'homework') return [];
  const out: Array<{ label: string; before: string; after: string }> = [];
  if (before.start !== lesson.start || before.end !== lesson.end) out.push({ label: 'Tid', before: when(before), after: when(lesson) });
  for (const [field, label] of [['rooms', 'Lokale'], ['teachers', 'Lærer'], ['holds', 'Hold']] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(lesson[field])) out.push({ label, before: before[field]?.join(', ') || '–', after: lesson[field]?.join(', ') || '–' });
  }
  if (before.title !== lesson.title) out.push({ label: 'Titel', before: before.title || '–', after: lesson.title || '–' });
  if (before.details !== lesson.details) out.push({ label: 'Lektier/note', before: '', after: 'opdateret' });
  return out;
}
