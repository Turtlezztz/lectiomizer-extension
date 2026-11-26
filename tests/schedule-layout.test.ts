import { describe, expect, it } from 'vitest';
import { detailSections, dominant, hourRange, layoutDay, splitPerson, subjectName, toLessons } from '@/features/schedule/lessons';
import { fmtRange, mondayOf, parseWeekParam, shiftWeek, weekDates, weekOf, weekParam } from '@/features/schedule/week';

const ev = (id: string, start: number, end: number) => ({ id, startMin: start, endMin: end });

describe('schedule layoutDay', () => {
  it('keeps non-overlapping lessons full width', () => {
    const out = layoutDay([ev('a', 480, 570), ev('b', 600, 690)]);
    expect(out.map((p) => [p.item.id, p.col, p.cols])).toEqual([['a', 0, 1], ['b', 0, 1]]);
  });
  it('places overlapping lessons side by side and shares column count per cluster', () => {
    const out = layoutDay([ev('a', 480, 570), ev('b', 500, 560), ev('c', 560, 620), ev('d', 700, 760)]);
    const by = Object.fromEntries(out.map((p) => [p.item.id, [p.col, p.cols]]));
    expect(by.a).toEqual([0, 2]);
    expect(by.b).toEqual([1, 2]);
    expect(by.c).toEqual([1, 2]); // reuses b's column once b has ended
    expect(by.d).toEqual([0, 1]);
  });
  it('handles three-way overlaps', () => {
    const out = layoutDay([ev('a', 480, 600), ev('b', 480, 600), ev('c', 490, 520)]);
    expect(out.every((p) => p.cols === 3)).toBe(true);
    expect(new Set(out.map((p) => p.col)).size).toBe(3);
  });
});

describe('schedule helpers', () => {
  it('computes hour range with an 08–16 minimum', () => {
    expect(hourRange([])).toEqual([8, 16]);
    expect(hourRange([ev('a', 495, 585)])).toEqual([8, 16]);
    expect(hourRange([ev('a', 450, 1050)])).toEqual([7, 18]);
  });
  it('round-trips ISO weeks', () => {
    expect(parseWeekParam('412026')).toEqual({ week: 41, year: 2026 });
    expect(parseWeekParam('012026')).toEqual({ week: 1, year: 2026 });
    expect(parseWeekParam('nope')).toBeNull();
    expect(weekParam({ week: 1, year: 2027 })).toBe('012027');
    const monday = mondayOf({ week: 41, year: 2026 });
    expect([monday.getFullYear(), monday.getMonth(), monday.getDate()]).toEqual([2026, 9, 5]);
    expect(shiftWeek({ week: 53, year: 2026 }, 1)).toEqual({ week: 1, year: 2027 });
    expect(shiftWeek({ week: 1, year: 2027 }, -1)).toEqual({ week: 53, year: 2026 });
    expect(weekOf(new Date(2026, 9, 9))).toEqual({ week: 41, year: 2026 });
    expect(weekDates({ week: 41, year: 2026 }).map((d) => d.getDate())).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });
  it('formats week ranges in Danish', () => {
    expect(fmtRange(new Date(2026, 9, 5), new Date(2026, 9, 9))).toBe('5.–9. oktober 2026');
    expect(fmtRange(new Date(2026, 8, 28), new Date(2026, 9, 2))).toMatch(/^28\. sep.* – 2\. okt.* 2026$/);
  });
  it('normalises reader lessons', () => {
    const [l] = toLessons([
      {
        id: 'absid:1', start: '2026-10-06T08:15', end: '2026-10-06T09:45', status: 'cancelled', title: '',
        holds: ['3a En'], teachers: ['Mette Skov (ms)'], rooms: ['C03'], details: 'Note:\nBrug tiden på projektet.', href: null,
      },
    ]);
    expect(l.subject).toBe('Engelsk');
    expect(l.day).toBe('2026-10-06');
    expect([l.startMin, l.endMin]).toEqual([495, 585]);
    expect(l.hasNote).toBe(true);
    expect(l.hasHomework).toBe(false);
    expect(l.noteText).toBe('Brug tiden på projektet.');
  });
  it('parses subjects, people and detail sections', () => {
    expect(subjectName('3a Ma')).toBe('Matematik');
    expect(subjectName('1x Xyz B')).toBe('Xyz B');
    expect(splitPerson('Lene Madsen (lm)')).toEqual({ name: 'Lene Madsen', code: 'lm' });
    expect(detailSections('Lektier:\n- Læs s. 12\n\nNote:\nHusk lommeregner')).toEqual({ homework: '- Læs s. 12', note: 'Husk lommeregner', other: '' });
    expect(dominant(['a', 'b', 'b'], (x) => x)).toBe('b');
  });
});
