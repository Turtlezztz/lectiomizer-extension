import { describe, expect, it } from 'vitest';
import { toLessons, type RawLesson } from '@/features/schedule/lessons';
import { busySpans, commonFree, gapsOfDay, minText, nextSchoolDay } from '@/features/schedule/free-time';
import { holdChoices, isHiddenLesson, splitHidden, toggleHold } from '@/features/schedule/hidden-holds';
import { hoursText, loadRatio, parseHours, workloadByDay } from '@/features/schedule/workload';

const raw = (id: string, start: string, end: string, extra: Partial<RawLesson> = {}): RawLesson => ({
  id, start, end, status: 'normal', title: '', holds: ['3a Ma'], teachers: [], rooms: [], details: '', href: null, ...extra,
});
const span = (s: string, e: string) => ({ startMin: +s.slice(0, 2) * 60 + +s.slice(3), endMin: +e.slice(0, 2) * 60 + +e.slice(3) });

describe('mellemtimer', () => {
  it('merges overlapping lessons and ignores cancelled ones', () => {
    expect(busySpans([{ ...span('08:15', '09:45') }, { ...span('09:00', '10:00') }, { ...span('11:00', '12:00'), status: 'cancelled' }])).toEqual([span('08:15', '10:00')]);
  });
  it('finds free stretches between lessons, not ordinary breaks', () => {
    const day = [span('08:15', '09:45'), span('09:55', '11:25'), span('12:35', '14:05')];
    expect(gapsOfDay(day)).toEqual([span('11:25', '12:35')]);
  });
  it('treats a cancelled lesson as free time', () => {
    const day = [span('08:15', '09:45'), { ...span('09:55', '11:25'), status: 'cancelled' }, span('11:35', '13:05')];
    expect(gapsOfDay(day)).toEqual([span('09:45', '11:35')]);
  });
  it('has no gaps before the first or after the last lesson', () => {
    expect(gapsOfDay([span('10:00', '11:00')])).toEqual([]);
  });
});

describe('common free time', () => {
  it('is time inside the school day where neither has a lesson', () => {
    const me = [span('08:00', '10:00'), span('12:00', '14:00')];
    const them = [span('08:00', '10:00'), span('13:00', '15:00')];
    expect(commonFree(me, them)).toEqual([span('10:00', '12:00')]);
  });
  it('counts the time before one starts when the other has a gap there', () => {
    const me = [span('08:00', '09:00'), span('11:00', '12:00')];
    const them = [span('10:00', '12:00')];
    expect(commonFree(me, them)).toEqual([span('09:00', '10:00')]);
  });
  it('uses the busy person’s gaps when the other has nothing that day', () => {
    expect(commonFree([], [span('08:00', '09:00'), span('10:00', '11:00')])).toEqual([span('09:00', '10:00')]);
    expect(commonFree([], [])).toEqual([]);
  });
  it('formats minutes as clock times', () => {
    expect(minText(615)).toBe('10:15');
  });
});

describe('next school day', () => {
  const lessons = toLessons([
    raw('a', '2026-10-05T08:15', '2026-10-05T09:45'),
    raw('b', '2026-10-06T10:00', '2026-10-06T11:30'),
    raw('c', '2026-10-06T12:00', '2026-10-06T15:30'),
    raw('x', '2026-10-06T08:15', '2026-10-06T09:45', { status: 'cancelled' }),
  ]);
  it('is the first later day with a lesson, from its first start to its last end', () => {
    const next = nextSchoolDay(lessons, new Date(2026, 9, 5, 12, 0))!;
    expect(next.first.id).toBe('b');
    expect(next.last.id).toBe('c');
    expect(next.date).toEqual(new Date(2026, 9, 6));
  });
  it('skips cancelled lessons and returns null when nothing is later', () => {
    expect(nextSchoolDay(lessons, new Date(2026, 9, 6, 7, 0))).toBeNull();
  });
});

describe('hidden holds', () => {
  const lessons = [raw('1', '', '', { holds: ['Kor'] }), raw('2', '', '', { holds: ['Kor', '3a Mu'] }), raw('3', '', '', { holds: [] })];
  it('hides a lesson only when all its holds are hidden', () => {
    expect(isHiddenLesson(lessons[0], new Set(['Kor']))).toBe(true);
    expect(isHiddenLesson(lessons[1], new Set(['Kor']))).toBe(false);
    expect(isHiddenLesson(lessons[2], new Set(['Kor']))).toBe(false);
    const split = splitHidden(lessons, ['Kor']);
    expect(split.hidden.map((l) => l.id)).toEqual(['1']);
    expect(split.shown.map((l) => l.id)).toEqual(['2', '3']);
  });
  it('lists holds of the week plus hidden ones, and toggles', () => {
    expect(holdChoices(lessons, ['Skak'])).toEqual(['3a Mu', 'Kor', 'Skak']);
    expect(toggleHold(['Kor'], 'Kor')).toEqual([]);
    expect(toggleHold([], 'Kor')).toEqual(['Kor']);
  });
});

describe('workload', () => {
  it('parses Lectio’s elevtid', () => {
    expect(parseHours('2,50')).toBe(2.5);
    expect(parseHours('1.5 timer')).toBe(1.5);
    expect(parseHours('')).toBe(0);
    expect(parseHours('0,00')).toBe(0);
  });
  it('sums hours per deadline day, leaving out handed-in work', () => {
    const map = workloadByDay([
      { title: 'Stil', hold: '3a Da', deadline: new Date(2026, 9, 7, 23, 30), studentTime: '3,00', statusKind: 'missing' },
      { title: 'Rapport', hold: '3a Fy', deadline: new Date(2026, 9, 7, 12, 0), studentTime: '1,5', statusKind: 'waiting' },
      { title: 'Afleveret', hold: '3a Ke', deadline: new Date(2026, 9, 7, 12, 0), studentTime: '4', statusKind: 'delivered' },
      { title: 'Uden tid', hold: '3a En', deadline: new Date(2026, 9, 8), studentTime: '', statusKind: 'missing' },
    ]);
    expect([...map.keys()]).toEqual(['2026-10-07']);
    expect(map.get('2026-10-07')!.hours).toBe(4.5);
    expect(hoursText(4.5)).toBe('4,5 t');
    expect(loadRatio(3)).toBe(0.5);
    expect(loadRatio(10)).toBe(1);
  });
});
