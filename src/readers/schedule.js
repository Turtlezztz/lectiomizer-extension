// Reads a SkemaNy.aspx week into plain lessons for the calendar sync. Each
// brick's tooltip carries the full date and time; the brick itself carries the
// lesson link and status classes.
import { ReaderError, readLesson } from './util.js';

const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utcDay = (y, m, d) => new Date(Date.UTC(y, m, d));

// ISO 8601 week of a local date, plus the seven dates it covers.
export function isoWeek(date) {
  const day = utcDay(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = day.getUTCDay() || 7;
  const thursday = utcDay(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 4 - weekday);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday - utcDay(year, 0, 1)) / 86400000 + 1) / 7);
  const dates = Array.from({ length: 7 }, (_, i) => isoDate(utcDay(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - weekday + 1 + i)));
  return { week, year, dates };
}

export function weeksFrom(date, count) {
  return Array.from({ length: count }, (_, i) => isoWeek(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * i)));
}

// Lectio addresses a week as ?week=WWYYYY, e.g. week=412026.
export function weekUrl(scheduleHref, { week, year }) {
  const url = new URL(scheduleHref);
  url.searchParams.set('week', pad(week) + year);
  return url.href;
}

const TIME = /^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s+til\s+(?:(\d{1,2})\/(\d{1,2})-(\d{4})\s+)?(\d{1,2}):(\d{2})/;
const FIELD = /^(Hold|Lærere?|Lokaler?|Elever?|Grupper?|Ressourcer?)\s*:\s*(.*)$/i;
const FIELD_NAMES = { hold: 'holds', 'lærer': 'teachers', 'lærere': 'teachers', lokale: 'rooms', lokaler: 'rooms' };
const stamp = (y, m, d, h, min) => `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}`;

// "Ændret!\nNovelleanalyse\n5/10-2026 08:15 til 09:45\nHold: 3a Da\nLærer: …\nLokale: A12\n\nLektier:\n- …"
export function parseTooltip(tooltip = '') {
  const lines = tooltip.split(/\r?\n/).map(line => line.trim());
  const at = lines.findIndex(line => TIME.test(line));
  if (at < 0) return null;
  const [, d, m, y, h1, m1, d2, mo2, y2, h2, m2] = lines[at].match(TIME);
  const start = stamp(y, m, d, h1, m1);
  const end = d2 ? stamp(y2, mo2, d2, h2, m2) : stamp(y, m, d, h2, m2);
  let status = 'normal';
  const titles = [];
  for (const line of lines.slice(0, at).filter(Boolean)) {
    if (/^aflyst!?$/i.test(line)) status = 'cancelled';
    else if (/^ændret!?$/i.test(line)) status = 'changed';
    else titles.push(line);
  }
  const fields = {};
  let rest = at + 1;
  for (; rest < lines.length; rest++) {
    const field = lines[rest].match(FIELD);
    if (!field) break;
    const key = field[1].toLocaleLowerCase('da');
    fields[FIELD_NAMES[key] || key] = field[2];
  }
  return { start, end, status, title: titles.join(' '), fields, details: lines.slice(rest).join('\n').trim() };
}

const list = value => (value || '').split(',').map(s => s.trim()).filter(Boolean);

// Lectio's lesson id (absid) keeps a lesson matched to its calendar event when
// the time, room or status changes.
function lessonId(href, tip) {
  if (href) {
    const params = new URL(href).searchParams;
    for (const key of ['absid', 'aftaleid', 'id']) if (params.get(key)) return `${key}:${params.get(key)}`;
  }
  let hash = 0;
  for (const char of tip.start + tip.title + (tip.fields.holds || '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `tid:${tip.start}:${Math.abs(hash).toString(36)}`;
}

export function readScheduleLesson(brick) {
  const tip = parseTooltip(brick.getAttribute('data-tooltip') || '');
  if (!tip) return null;
  const dom = readLesson(brick);
  return {
    id: lessonId(dom.href, tip),
    start: tip.start, end: tip.end,
    status: dom.status !== 'normal' ? dom.status : tip.status,
    title: tip.title || dom.title,
    holds: tip.fields.holds ? list(tip.fields.holds) : dom.holds,
    teachers: tip.fields.teachers ? list(tip.fields.teachers) : dom.teachers,
    rooms: tip.fields.rooms ? list(tip.fields.rooms) : list(dom.room),
    details: tip.details,
    href: dom.href,
  };
}

export function readSchedule(doc) {
  if (!doc.querySelector('table.s2skema')) throw new ReaderError('Skemaet blev ikke fundet');
  const lessons = new Map();
  for (const brick of doc.querySelectorAll('table.s2skema .s2skemabrik')) {
    const lesson = readScheduleLesson(brick);
    if (lesson && !lessons.has(lesson.id)) lessons.set(lesson.id, lesson);
  }
  return Array.from(lessons.values());
}
