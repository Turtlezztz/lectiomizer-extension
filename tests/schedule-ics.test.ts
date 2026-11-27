import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, foldLine, localStamp, uidOf, utcStamp } from '@/features/schedule/ics';

const now = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
const lesson = {
  id: 'absid:123',
  start: '2026-10-05T08:15',
  end: '2026-10-05T09:45',
  status: 'normal',
  title: 'Prøve',
  holds: ['3a Ma'],
  teachers: ['Lene Madsen (lm)'],
  rooms: ['A12', 'B3'],
  details: 'Lektier:\n- Side 4; opgave 2, 3',
  href: 'https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=123',
};
const unfold = (text: string) => text.replace(/\r\n /g, '');

describe('ics text', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
  it('folds long lines at 75 octets without splitting characters', () => {
    const line = `SUMMARY:${'æ'.repeat(60)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(unfold(folded)).toBe(line);
    expect(foldLine('SHORT:x')).toBe('SHORT:x');
  });
  it('formats stamps', () => {
    expect(utcStamp(now)).toBe('20261001T120000Z');
    expect(localStamp('2026-10-05T08:15')).toBe('20261005T081500');
    expect(uidOf('lesson', 'absid:123')).toBe('lesson-absid:123@lectiomizer');
    expect(uidOf('deadline', 'a b/c')).toBe('deadline-a-b-c@lectiomizer');
  });
});

describe('buildIcs', () => {
  const ics = buildIcs({
    lessons: [lesson, { ...lesson, id: 'absid:124', start: '2026-10-06T10:00', end: '2026-10-06T11:30', status: 'cancelled' }, { ...lesson }],
    deadlines: [{ id: '555', title: 'Stil, del 1', hold: '3a Da', deadline: new Date(Date.UTC(2026, 9, 7, 21, 30)), deadlineText: '7/10-2026 23:30', href: 'https://www.lectio.dk/lectio/123/ElevAflevering.aspx?exerciseid=555' }],
    now,
  });
  const text = unfold(ics);

  it('is a CRLF calendar with the Copenhagen time zone', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
    expect(text).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Copenhagen');
  });
  it('writes lessons in local time with stable UIDs, once each', () => {
    expect(text.match(/UID:lesson-absid:123@lectiomizer/g)).toHaveLength(1);
    expect(text).toContain('DTSTART;TZID=Europe/Copenhagen:20261005T081500');
    expect(text).toContain('DTEND;TZID=Europe/Copenhagen:20261005T094500');
    expect(text).toContain('SUMMARY:3a Ma · Prøve');
    expect(text).toContain('LOCATION:A12\\, B3');
    expect(text).toContain('Side 4\\; opgave 2\\, 3');
    expect(text).toContain(`DTSTAMP:20261001T120000Z`);
  });
  it('marks cancelled lessons', () => {
    const event = text.split('BEGIN:VEVENT').find((e) => e.includes('absid:124'))!;
    expect(event).toContain('STATUS:CANCELLED');
    expect(event).toContain('SUMMARY:Aflyst: 3a Ma · Prøve');
    expect(event).toContain('TRANSP:TRANSPARENT');
  });
  it('adds deadlines as short UTC events ending at the deadline', () => {
    const event = text.split('BEGIN:VEVENT').find((e) => e.includes('UID:deadline-555@lectiomizer'))!;
    expect(event).toContain('DTSTART:20261007T210000Z');
    expect(event).toContain('DTEND:20261007T213000Z');
    expect(event).toContain('SUMMARY:Aflevering: Stil\\, del 1');
    expect(event).toContain('URL:https://www.lectio.dk/lectio/123/ElevAflevering.aspx?exerciseid=555');
  });
  it('drops malformed lessons', () => {
    const bad = buildIcs({ lessons: [{ ...lesson, start: 'nonsense' }], now });
    expect(bad).not.toContain('BEGIN:VEVENT');
  });
});
