// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareAll, compareFeeds, compareSchedule, homeworkText, makeDigest, remindDeadlines } from '@/lib/sync/changes.js';
import { absenceItems, gradeItems } from '@/lib/sync/feeds.js';
import { readGrades } from '@/lib/lectio/readers/grades.js';
import { readAbsence } from '@/lib/lectio/readers/absence.js';
import { noticeBody, noticeTitle } from '@/lib/sync/notice';
import { SYNC_DEFAULTS, inQuietHours, typeEnabled, typeOfKind } from '@/lib/sync/store';

const at = (iso: string) => new Date(iso).getTime();
const lesson = (patch = {}) => ({ id: 'absid:1', start: '2030-01-08T08:15', end: '2030-01-08T09:45', title: '', status: 'normal', holds: ['3a Da'], teachers: ['lm'], rooms: ['A12'], details: '', href: 'https://www.lectio.dk/lectio/1/aktivitet/aktivitetforside2.aspx?absid=1', ...patch });
const DATES = ['2030-01-07', '2030-01-08', '2030-01-09', '2030-01-10', '2030-01-11', '2030-01-12', '2030-01-13'];
const week = (lessons: object[]) => [{ dates: DATES, lessons }];
// Monday 7 January 2030, 12:00 in Copenhagen.
const now = at('2030-01-07T12:00:00+01:00');

describe('schedule notice kinds', () => {
  it('reports a room-only change as its own kind, other changes as "changed"', () => {
    const base = compareSchedule({}, week([lesson()]), now);
    const room = compareSchedule(base, week([lesson({ rooms: ['B21'] })]), now + 1);
    expect(room.messages.map((m: any) => m.kind)).toEqual(['room']);
    expect(noticeTitle(room.messages[0])).toBe('3a Da er flyttet til B21');
    const both = compareSchedule(base, week([lesson({ rooms: ['B21'], teachers: ['tn'] })]), now + 1);
    expect(both.messages.map((m: any) => m.kind)).toEqual(['changed']);
  });

  it('reports homework only for the next school day', () => {
    const tomorrow = lesson();
    const later = lesson({ id: 'absid:2', start: '2030-01-10T08:15', end: '2030-01-10T09:45' });
    const base = compareSchedule({}, week([tomorrow, later]), now);
    const details = 'Lektier:\n- Læs side 12-30';
    const next = compareSchedule(base, week([{ ...tomorrow, details }, { ...later, details }]), now + 1);
    expect(next.messages.map((m: any) => [m.kind, m.lesson.id])).toEqual([['homework', 'absid:1']]);
    expect(noticeTitle(next.messages[0])).toBe('Lektier til 3a Da');
    expect(noticeBody(next.messages[0])).toContain('Læs side 12-30');
    // Snapshot still moves on, so absid:2 won't be reported later.
    expect(next.lessons.find((l: any) => l.id === 'absid:2').details).toBe(details);
  });

  it('extracts the homework part of tooltip details', () => {
    expect(homeworkText('Lektier:\n- Læs side 1\n- Opgave 2\n\nNote:\nHusk lommeregner')).toBe('Læs side 1 · Opgave 2');
    expect(homeworkText('Note:\nHusk lommeregner')).toBe('');
  });
});

describe('grade and absence feeds', () => {
  const grade = (value: string) => ({ id: 'Dansk A|3a Da|Skriftlig|1.standpunkt', revision: value, title: 'Dansk A, Skriftlig', value, type: '1.standpunkt', href: 'g' });

  it('baselines silently, then reports new and changed grades', () => {
    const first = compareFeeds({}, { lectioMessages: null, assignments: null, grades: [grade('7')] }, now);
    expect(first.messages).toHaveLength(0);
    const changed = compareFeeds(first, { lectioMessages: null, assignments: null, grades: [grade('10')] }, now + 1);
    expect(changed.messages.map((m: any) => m.kind)).toEqual(['grade']);
    expect(noticeTitle(changed.messages[0])).toBe('Ny karakter i Dansk A, Skriftlig: 10');
  });

  it('keeps a baseline on a failed read but drops it when the type is off', () => {
    const first = compareFeeds({}, { lectioMessages: null, assignments: null, grades: [grade('7')] }, now);
    expect(compareFeeds(first, { lectioMessages: null, assignments: null, grades: null }, now + 1).feeds.grades).toBeDefined();
    const off = compareFeeds(first, { lectioMessages: null, assignments: null }, now + 1);
    expect(off.feeds.grades).toBeUndefined();
    // On again: a fresh, silent baseline instead of a flood.
    expect(compareFeeds(off, { lectioMessages: null, assignments: null, grades: [grade('12')] }, now + 2).messages).toHaveLength(0);
  });

  const fixture = (file: string, url: string) => {
    const doc = new DOMParser().parseFromString(readFileSync(`fixtures/${file}`, 'utf8'), 'text/html');
    const base = doc.createElement('base');
    base.href = url;
    doc.head.prepend(base);
    return doc;
  };
  it('turns the grade and absence pages into feed items', () => {
    const grades = gradeItems(readGrades(fixture('c103d81d1c1d6180.html', 'https://www.lectio.dk/lectio/123/grades/grade_report.aspx')), 'g');
    expect(grades.length).toBeGreaterThan(0);
    expect(new Set(grades.map((g: any) => g.id)).size).toBe(grades.length);
    expect(grades[0]).toMatchObject({ title: 'Dansk A, Skriftlig', value: '7', type: '1.standpunkt' });
    const absence = absenceItems(readAbsence(fixture('0babd6b6c12083cb.html', 'https://www.lectio.dk/lectio/123/subnav/fravaerelev_fravaersaarsager.aspx')), 'a');
    expect(absence[0]).toMatchObject({ id: '1', title: '3a Da · ma 5/10 2. modul', description: 'Modul 100%' });
    expect(new Set(absence.map((a: any) => a.id)).size).toBe(absence.length);
  });
});

describe('deadline reminders', () => {
  const deadline = '2030-01-08T22:59:00.000Z'; // Tuesday 23:59 in Copenhagen
  const item = (patch = {}) => ({ id: '9', title: 'Rapport', href: 'h', deadline, delivered: false, description: '3a Fy · Frist: 8/1-2030 23:59', ...patch });

  it('stays silent on the first run, then fires 24h and 2h once each', () => {
    const base = remindDeadlines({}, [item()], now); // 36 hours before: nothing yet, but a baseline
    expect(base.messages).toHaveLength(0);
    expect(base.reminded).toEqual([]);
    const day = remindDeadlines(base, [item()], at('2030-01-08T09:00:00+01:00'));
    expect(day.messages.map((m: any) => m.reminder)).toEqual(['24h']);
    expect(noticeTitle(day.messages[0])).toBe('Frist inden for et døgn: Rapport');
    expect(remindDeadlines(day, [item()], at('2030-01-08T10:00:00+01:00')).messages).toHaveLength(1);
    const soon = remindDeadlines(day, [item()], at('2030-01-08T22:30:00+01:00'));
    expect(soon.messages.map((m: any) => m.reminder)).toEqual(['2h', '24h']);
    expect(remindDeadlines(soon, [item()], at('2030-01-08T23:00:00+01:00')).messages).toHaveLength(2);
  });

  it('fires only the 2h reminder when the first check inside a window is already late', () => {
    const base = remindDeadlines({}, [], now);
    const late = remindDeadlines(base, [item()], at('2030-01-08T22:30:00+01:00'));
    expect(late.messages.map((m: any) => m.reminder)).toEqual(['2h']);
  });

  it('skips handed-in and past assignments, and reminds again for a moved deadline', () => {
    const base = remindDeadlines({}, [], now);
    const t = at('2030-01-08T09:00:00+01:00');
    expect(remindDeadlines(base, [item({ delivered: true }), item({ id: '8', deadline: '2030-01-07T10:00:00.000Z' })], t).messages).toHaveLength(0);
    const first = remindDeadlines(base, [item()], t);
    const moved = remindDeadlines(first, [item({ deadline: '2030-01-08T23:30:00.000Z' })], t + 1000);
    expect(moved.messages.map((m: any) => m.reminder)).toEqual(['24h', '24h']);
  });
});

describe('Din dag', () => {
  const morning = at('2030-01-08T07:05:00+01:00');
  const lessons = [lesson({ id: 'absid:3', start: '2030-01-08T10:00', end: '2030-01-08T11:30', holds: ['3a Ma'], rooms: ['B14'] }), lesson(), lesson({ id: 'absid:4', status: 'cancelled', start: '2030-01-08T12:00', end: '2030-01-08T13:00' })];
  const assignments = [{ id: '9', title: 'Rapport', href: 'h', deadline: '2030-01-08T22:59:00.000Z', delivered: false }];

  it('sums up the day once', () => {
    const value = makeDigest({}, week(lessons), assignments, morning, 'home');
    expect(value.messages).toHaveLength(1);
    const notice = value.messages[0];
    expect(noticeTitle(notice)).toBe('Din dag: 2 moduler');
    expect(noticeBody(notice)).toMatch(/^Første modul 08:15 3a Da i A12 · Aflevering i dag: Rapport/);
    expect(makeDigest(value, week(lessons), assignments, morning + 3600_000, 'home').messages).toHaveLength(1);
  });

  it('marks empty days done without a notice, and waits for a readable week', () => {
    const empty = makeDigest({}, week([]), [], morning);
    expect(empty).toMatchObject({ digestDay: '2030-01-08' });
    expect(empty.messages).toBeUndefined();
    expect(makeDigest({}, [{ dates: DATES, error: 'x' }], [], morning)).toEqual({});
  });
});

describe('compareAll', () => {
  it('drops new notices of types that are off but still moves the baseline', () => {
    const read = (rooms: string[]) => ({ weeks: week([lesson({ rooms })]), feeds: { lectioMessages: null, assignments: null } });
    const base = compareAll({}, read(['A12']), { now });
    const off = compareAll(base, read(['B21']), { now: now + 1, isOn: (kind: string) => kind !== 'room' });
    expect(off.messages).toHaveLength(0);
    expect(off.lessons[0].rooms).toEqual(['B21']);
    expect(compareAll(base, read(['B21']), { now: now + 1 }).messages).toHaveLength(1);
  });
});

describe('preferences', () => {
  it('defaults existing and new types on, Din dag off', () => {
    expect(typeEnabled(SYNC_DEFAULTS, 'changed')).toBe(true);
    expect(typeEnabled(SYNC_DEFAULTS, 'grade')).toBe(true);
    expect(typeEnabled(SYNC_DEFAULTS, 'digest')).toBe(false);
    expect(typeEnabled({ types: { message: false } }, 'message')).toBe(false);
    expect(typeOfKind('removed')).toBe('cancelled');
  });

  it('knows Stilletimer, also across midnight', () => {
    const quiet = { quiet: true, quietFrom: '22:00', quietTo: '07:00' };
    expect(inQuietHours(quiet, at('2030-01-07T23:30:00+01:00'))).toBe(true);
    expect(inQuietHours(quiet, at('2030-01-08T06:59:00+01:00'))).toBe(true);
    expect(inQuietHours(quiet, at('2030-01-08T07:00:00+01:00'))).toBe(false);
    expect(inQuietHours({ ...quiet, quiet: false }, at('2030-01-07T23:30:00+01:00'))).toBe(false);
    expect(inQuietHours({ quiet: true, quietFrom: '12:00', quietTo: '13:00' }, at('2030-01-07T12:30:00+01:00'))).toBe(true);
  });
});
