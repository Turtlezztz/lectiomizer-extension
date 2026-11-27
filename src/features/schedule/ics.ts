// iCalendar (.ics, RFC 5545) export of the schedule and assignment deadlines,
// for Apple Calendar, Outlook and others. Pure: the page fetches the weeks and
// downloads the text. Reuses the Google sync's event mapping (events.js), so
// both calendars read the same.
import { TIME_ZONE, deadlineToEvent, lessonToEvent } from '@/lib/sync/events.js';

export interface IcsLesson {
  id: string;
  start: string; // 'YYYY-MM-DDTHH:MM', local Danish time
  end: string;
  status?: string;
  title?: string;
  holds?: string[];
  teachers?: string[];
  rooms?: string[];
  details?: string;
  href?: string | null;
}

export interface IcsDeadline {
  /** Lectio's exerciseid. */
  id: string;
  title: string;
  hold?: string;
  deadline: Date;
  deadlineText?: string;
  href?: string | null;
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets (UTF-8), never inside a character; continuation lines start with a space. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length ? 74 : 75; // the leading space counts
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → '20261005T081500Z' */
export function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** '2026-10-05T08:15' or '2026-10-05T08:15:00' → '20261005T081500' (floating, used with TZID). */
export function localStamp(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error(`Ugyldigt tidspunkt: ${value}`);
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] || '00'}`;
}

/** Stable across exports, so re-importing updates instead of duplicating. */
export const uidOf = (kind: 'lesson' | 'deadline', id: string) => `${kind}-${id.replace(/[^A-Za-z0-9._:-]/g, '-')}@lectiomizer`;

// Denmark's rules since 1996 (EU summer time).
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TIME_ZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function eventLines(uid: string, stamp: string, body: any, times: string[], extra: string[] = []): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    ...times,
    `SUMMARY:${escapeText(body.summary || '')}`,
    ...(body.location ? [`LOCATION:${escapeText(body.location)}`] : []),
    ...(body.description ? [`DESCRIPTION:${escapeText(body.description)}`] : []),
    ...(body.source?.url ? [`URL:${body.source.url}`] : []),
    `TRANSP:${body.transparency === 'transparent' ? 'TRANSPARENT' : 'OPAQUE'}`,
    ...extra,
    'END:VEVENT',
  ];
}

export function buildIcs({ lessons, deadlines = [], now = new Date(), name = 'Lectio' }: { lessons: IcsLesson[]; deadlines?: IcsDeadline[]; now?: Date; name?: string }): string {
  const stamp = utcStamp(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lectiomizer//Skema//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(name)}`, `X-WR-TIMEZONE:${TIME_ZONE}`, ...VTIMEZONE];
  const seen = new Set<string>();
  for (const lesson of lessons) {
    const event = lessonToEvent(lesson);
    if (!event || seen.has(`l:${event.id}`)) continue;
    seen.add(`l:${event.id}`);
    const cancelled = lesson.status === 'cancelled';
    lines.push(
      ...eventLines(
        uidOf('lesson', event.id),
        stamp,
        event.body,
        [`DTSTART;TZID=${TIME_ZONE}:${localStamp(lesson.start)}`, `DTEND;TZID=${TIME_ZONE}:${localStamp(lesson.end)}`],
        [`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`, ...(lesson.status === 'changed' ? ['CATEGORIES:Ændret'] : [])],
      ),
    );
  }
  for (const d of deadlines) {
    if (!(d.deadline instanceof Date) || Number.isNaN(d.deadline.getTime())) continue;
    const event = deadlineToEvent({
      id: d.id,
      title: d.title,
      href: d.href,
      deadline: d.deadline.toISOString(),
      description: [d.hold, d.deadlineText && `Frist: ${d.deadlineText}`].filter(Boolean).join(' · '),
    });
    if (!event || seen.has(`d:${event.id}`)) continue;
    seen.add(`d:${event.id}`);
    const start = new Date(event.body.start.dateTime);
    lines.push(...eventLines(uidOf('deadline', event.id), stamp, event.body, [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(d.deadline)}`], ['STATUS:CONFIRMED', 'CATEGORIES:Aflevering']));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Offers the text as a file download. */
export function downloadText(text: string, filename: string, type = 'text/calendar;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
