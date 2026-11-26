import { describe, expect, it } from 'vitest';
import { gradeNumber, gradeTone, groupByTerm, latestGrade, scaleLabel, splitLevel, summarize, typeName, xprsName, type Grade } from '@/features/grades/grade-utils';

const g = (value: string, type: string, extra: Partial<Grade> = {}): Grade => ({ type, value, final: false, extra: [], xprs: null, source: null, weight: '1', ...extra });

describe('grade utils', () => {
  it('parses the 7-point scale', () => {
    expect(gradeNumber('02')).toBe(2);
    expect(gradeNumber('-3')).toBe(-3);
    expect(gradeNumber('8,4')).toBe(8.4);
    expect(gradeNumber('B')).toBeNull();
    expect(scaleLabel('2')).toBe('02');
    expect(scaleLabel('5')).toBeNull();
    expect([gradeTone('12'), gradeTone('7'), gradeTone('4'), gradeTone('02'), gradeTone('-3'), gradeTone('Bestået')]).toEqual(['top', 'good', 'mid', 'low', 'fail', 'none']);
  });
  it('names types and subjects', () => {
    expect(typeName('1.standpunkt')).toBe('1. standpunkt');
    expect(typeName('Eksamens-/årsprøvekarakter')).toBe('Eksamen');
    expect(xprsName('22359A Matematik')).toBe('Matematik');
    expect(splitLevel('Dansk A')).toEqual({ name: 'Dansk', level: 'A' });
  });
  it('summarizes the latest grade per form, weighted', () => {
    const subjects = [
      { subject: 'Dansk A', hold: '', forms: [{ form: 'Skriftlig', grades: [g('7', '1.standpunkt'), g('10', 'Årskarakter', { final: true })] }] },
      { subject: 'Kemi B', hold: '', forms: [{ form: 'Mundtlig', grades: [g('4', '1.standpunkt', { weight: '0,5' }), g('02', '2.standpunkt', { weight: '0,5' })] }] },
    ];
    expect(latestGrade(subjects[0].forms[0].grades)?.value).toBe('10');
    const s = summarize(subjects);
    expect(s.count).toBe(2);
    expect(s.unweighted).toBe(6);
    expect(s.weighted).toBeCloseTo((10 + 2 * 0.5) / 1.5);
    expect(s.distribution['02']).toBe(1);
    expect(s.distribution['10']).toBe(1);
  });
  it('groups protocol rows by term in order', () => {
    expect(groupByTerm([{ Termin: 'S26' }, { Termin: 'V25' }, { Termin: 'S26' }]).map((t) => [t.term, t.rows.length])).toEqual([['S26', 2], ['V25', 1]]);
  });
});
