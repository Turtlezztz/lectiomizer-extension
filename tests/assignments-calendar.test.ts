import { describe, expect, it } from 'vitest';
import { byDay, dayKey, monthGrid, shiftMonth } from '@/features/assignments/calendar';

describe('assignment month calendar', () => {
  it('builds whole Monday-first weeks around the month', () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = monthGrid(2026, 10);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0].key).toBe('2026-10-26');
    expect(weeks[0][6]).toMatchObject({ key: '2026-11-01', inMonth: true });
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks.at(-1)![0].key).toBe('2026-11-30');
    expect(weeks.at(-1)![6].key).toBe('2026-12-06');
  });

  it('uses four weeks for a February that fits exactly', () => {
    // February 2027 starts on a Monday and has 28 days.
    const weeks = monthGrid(2027, 1);
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0].key).toBe('2027-02-01');
    expect(weeks[3][6].key).toBe('2027-02-28');
  });

  it('groups items by deadline day, sorted by time, and skips undated ones', () => {
    const a = { id: 'a', deadline: new Date(2026, 10, 27, 23, 59) };
    const b = { id: 'b', deadline: new Date(2026, 10, 27, 8, 0) };
    const c = { id: 'c', deadline: null };
    const days = byDay([a, b, c]);
    expect([...days.keys()]).toEqual(['2026-11-27']);
    expect(days.get('2026-11-27')!.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('moves between months across years', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
