import { describe, expect, it } from 'vitest';
import { absenceTone, groupByWeek, parseAmount, parsePercent } from '@/features/absence/absence-utils';

describe('absence utils', () => {
  it('parses percentages', () => {
    expect(parsePercent('6,9%')).toBe(6.9);
    expect(parsePercent('12 moduler')).toBeNull();
    expect(parseAmount('Modul 50%')).toEqual({ label: 'Modul', percent: 50 });
  });
  it('tones and groups', () => {
    expect([absenceTone(3), absenceTone(11), absenceTone(16)]).toEqual(['ok', 'warn', 'high']);
    const rows = [{ week: '41' }, { week: '40' }, { week: '41' }] as any;
    expect(groupByWeek(rows).map((w) => w.week)).toEqual(['41', '40']);
  });
});
