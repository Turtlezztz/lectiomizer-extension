import { describe, expect, it } from 'vitest';
import { absenceStat, assignmentStats, inWeek, lessonStats, parseHours, schoolYearWeeks, weekFinished, type SlimLesson } from '@/features/wrapped/stats';
import type { RawLesson } from '@/features/schedule/lessons';

const lesson = (over: Partial<SlimLesson> & { start: string; end: string }): SlimLesson => ({
  id: over.id ?? over.start,
  status: 'normal',
  title: '',
  holds: ['3a Ma'],
  teachers: ['Lene Madsen (lm)'],
  rooms: ['21'],
  ...over,
});

describe('lessonStats', () => {
  const now = new Date('2026-11-27T12:00:00');
  const lessons: SlimLesson[] = [
    lesson({ start: '2026-11-02T08:00:00', end: '2026-11-02T09:30:00' }),
    lesson({ start: '2026-11-03T08:00:00', end: '2026-11-03T09:30:00', holds: ['3a Da'], rooms: ['12'] }),
    lesson({ start: '2026-11-04T08:00:00', end: '2026-11-04T09:30:00', status: 'cancelled', holds: ['3a Da'] }),
    lesson({ start: '2026-11-05T08:00:00', end: '2026-11-05T09:30:00', status: 'changed' }),
    lesson({ start: '2026-11-10T08:00:00', end: '2026-11-10T09:30:00' }),
    // duplicate id, an event without a team, and one in the future: none counted
    lesson({ id: '2026-11-10T08:00:00', start: '2026-11-10T08:00:00', end: '2026-11-10T09:30:00' }),
    lesson({ start: '2026-11-11T08:00:00', end: '2026-11-11T15:00:00', holds: [] }),
    lesson({ start: '2026-12-01T08:00:00', end: '2026-12-01T09:30:00' }),
  ];

  it('counts held and cancelled lessons with hours', () => {
    const s = lessonStats(lessons, now);
    expect(s.held).toBe(4);
    expect(s.hours).toBe(6);
    expect(s.cancelled).toBe(1);
    expect(s.mostCancelled).toEqual({ subject: 'Dansk', count: 1 });
  });

  it('finds the busiest week, top subject, room and teacher', () => {
    const s = lessonStats(lessons, now);
    expect(s.busiestWeek).toEqual({ year: 2026, week: 45, count: 3 });
    expect(s.topSubject).toEqual({ subject: 'Matematik', count: 3, hours: 5 });
    expect(s.topRoom).toEqual({ room: '21', count: 3 });
    expect(s.topTeacher).toEqual({ name: 'Lene Madsen', count: 4 });
  });

  it('returns nulls without lessons', () => {
    const s = lessonStats([], now);
    expect(s).toMatchObject({ held: 0, hours: 0, cancelled: 0, mostCancelled: null, busiestWeek: null, topSubject: null, topRoom: null });
  });
});

describe('weeks', () => {
  it('lists the school year weeks from August up to now', () => {
    const weeks = schoolYearWeeks(2026, new Date('2026-08-20T10:00:00'));
    expect(weeks[0]).toEqual({ week: 31, year: 2026 }); // the week of 1 August 2026 (a Saturday)
    expect(weeks.at(-1)).toEqual({ week: 34, year: 2026 });
  });

  it('stops at the end of July for a past year', () => {
    const weeks = schoolYearWeeks(2024, new Date('2026-11-27'));
    expect(weeks.at(-1)).toEqual({ week: 31, year: 2025 });
    expect(weeks.length).toBe(53);
  });

  it('knows finished weeks', () => {
    expect(weekFinished({ week: 48, year: 2026 }, new Date('2026-11-27'))).toBe(false);
    expect(weekFinished({ week: 47, year: 2026 }, new Date('2026-11-27'))).toBe(true);
  });

  it('keeps only lessons inside the week', () => {
    const raw = [{ start: '2026-11-23T08:00:00' }, { start: '2026-11-30T08:00:00' }] as RawLesson[];
    expect(inWeek(raw, { week: 48, year: 2026 })).toHaveLength(1);
  });
});

describe('assignments and absence', () => {
  it('counts handed-in assignments and their elevtimer in the year', () => {
    const items = [
      { statusKind: 'delivered' as const, deadline: new Date('2026-09-01'), studentTime: '4,00' },
      { statusKind: 'delivered' as const, deadline: new Date('2026-10-01'), studentTime: '1,5' },
      { statusKind: 'missing' as const, deadline: new Date('2026-10-02'), studentTime: '3,00' },
      { statusKind: 'delivered' as const, deadline: new Date('2026-05-01'), studentTime: '9,00' }, // last year
    ];
    expect(assignmentStats(items, 2026)).toEqual({ delivered: 2, total: 3, hours: 5.5 });
  });

  it('parses hours', () => {
    expect(parseHours('4,00')).toBe(4);
    expect(parseHours('')).toBe(0);
  });

  it('takes the first percentage total', () => {
    expect(absenceStat({ totals: [{ value: '12', label: 'Moduler' }, { value: '6,9%', label: 'Fravær' }] })).toEqual({ label: 'Fravær', value: '6,9%', percent: 6.9 });
    expect(absenceStat({ totals: [] })).toBeNull();
  });
});
