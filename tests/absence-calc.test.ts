// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  bufferNow, bufferYear, estimateCounts, gaugeTone, groupByDay, modulesOf, modulesToRecover, parseLessonDate,
  breakdown, projectYearEnd, recentAbsent, resolveCounts, toggleAll, yearProgress,
} from '@/features/absence/absence-calc';
import { readAbsenceOverview } from '@/lib/lectio/readers/absence.js';
import { parseDocument } from '@/lib/lectio/client';
import { absenceOverviewPage } from '../scripts/absence-fixture.mjs';
import type { AbsenceRow } from '@/features/absence/absence-utils';

const row = (date: string, amount = 'Modul 100%', week = ''): AbsenceRow => ({
  week, lessonText: '', amount, registered: '', registeredBy: '', remark: '', cause: '', comment: '', edit: `e-${date}-${Math.random()}`,
  lesson: { href: null, date, module: '1. modul', room: '', status: 'normal', holds: [], teachers: [], title: '' },
});

describe('fraværsberegner', () => {
  it('counts modules from amounts', () => {
    expect(modulesOf('Modul 100%')).toBe(1);
    expect(modulesOf('Modul 50%')).toBe(0.5);
    expect(modulesOf('2 timer')).toBe(0);
  });

  it('finds the buffer below the threshold', () => {
    // 7/100 → 3 more: 10/103 = 9,7 %; 4 more would be 11/104 = 10,6 %
    expect(bufferNow(7, 100, 10)).toBe(3);
    expect(bufferNow(10, 100, 10)).toBe(0);
    expect(bufferNow(12, 100, 10)).toBe(0);
    expect(bufferNow(0, 9, 10)).toBe(0); // 1/10 is exactly 10 %
    expect(bufferNow(0, 10, 10)).toBe(1); // 1/11 = 9,1 %
  });

  it('finds the whole-year buffer and the way back', () => {
    expect(bufferYear(7, 300, 10)).toBe(22); // 29/300 < 10 %, 30/300 is not
    expect(bufferYear(40, 300, 10)).toBe(0);
    expect(modulesToRecover(11, 100, 10)).toBe(11); // 11/111 = 9,9 %
  });

  it('estimates held modules from the percentage', () => {
    const rows = [row('ma 5/10'), row('ti 6/10', 'Modul 50%')];
    expect(estimateCounts(5, rows)).toEqual({ absent: 1.5, held: 30, yearTotal: null, source: 'estimate' });
    expect(estimateCounts(0, rows)).toBeNull();
  });

  it('prefers Lectio counts only when they match the page percentage', () => {
    const rows = [row('ma 5/10')];
    expect(resolveCounts({ absent: 7, total: 100 }, 7, rows)?.source).toBe('lectio');
    expect(resolveCounts({ absent: 7, total: 100 }, 2, rows)?.source).toBe('estimate');
  });

  it('parses short lesson dates into the right school year', () => {
    const today = new Date(2026, 0, 15);
    expect(parseLessonDate('ma 5/10', today)).toEqual(new Date(2025, 9, 5));
    expect(parseLessonDate('to 8/1', today)).toEqual(new Date(2026, 0, 8));
    expect(yearProgress(new Date(2025, 7, 1))).toBe(0);
  });

  it('projects the year end from the recent pace', () => {
    const today = new Date(2026, 0, 15);
    const rows = [row('ma 5/1'), row('ti 6/1'), row('on 7/1'), row('ma 5/10')];
    expect(recentAbsent(rows, today)).toBe(3);
    const p = projectYearEnd({ absent: 4, held: 400, yearTotal: 800, source: 'lectio' }, rows, today)!;
    expect(p.recent).toBe(true);
    expect(p.percent).toBeGreaterThan(1); // the last weeks were worse than the 1 % average
    expect(projectYearEnd({ absent: 4, held: 400, yearTotal: 400, source: 'lectio' }, rows, today)).toBeNull();
  });

  it('tones the gauge', () => {
    expect([gaugeTone(5, 10), gaugeTone(8.5, 10), gaugeTone(10, 10)]).toEqual(['ok', 'warn', 'high']);
  });

  it('groups and toggles whole days', () => {
    const rows = [row('ma 5/10'), row('ma 5/10'), row('ti 6/10')];
    const days = groupByDay(rows);
    expect(days.map((d) => d.rows.length)).toEqual([2, 1]);
    const keys = days[0].rows.map((r) => r.edit!);
    const on = toggleAll(new Set([keys[0]]), keys);
    expect(on.size).toBe(2);
    expect(toggleAll(on, keys).size).toBe(0);
  });
});

describe('readAbsenceOverview', () => {
  const url = 'https://www.lectio.dk/lectio/123/subnav/fravaerelev.aspx';
  const page = (options?: { detailed?: boolean; remarks?: boolean }) => readAbsenceOverview(parseDocument(absenceOverviewPage('/lectio/123/', options), url));

  it('reads every hold and the total with "Vis detaljer" on', () => {
    const o = page();
    expect(o.detailed).toBe(true);
    expect(o.detailToggle).toBeNull();
    expect(o.holds.map((h: any) => h.hold)).toEqual(['3a Da', '3a Ma', '3a En', '3a Fy', '3a Id', 'Ej hold']);
    expect(o.holds[0].regular).toEqual({ period: { absent: 2, total: 14, percent: 14.3 }, settled: { absent: 4, total: 32, percent: 12.5 } });
    expect(o.holds[0].written.settled).toEqual({ absent: 1, total: 40, percent: 2.5 });
    expect(o.holds[1].regular.settled.absent).toBe(2.5);
    expect(o.holds[3].written.period).toEqual({ absent: null, total: null, percent: null });
    expect(o.total.regular.settled).toEqual({ absent: 9, total: 130, percent: 6.9 });
    expect(o.total.written.settled).toMatchObject({ absent: 1, total: 90 });
    expect(o.period).toEqual({ from: '05/09-2026', to: '05/10-2026' });
    expect(o.remarks).toEqual([{ date: '05-10-2026', by: 'lm', type: 'Samtale', note: 'For højt fravær i dansk' }]);
  });

  it('reads the short table and offers the details switch', () => {
    const o = page({ detailed: false, remarks: false });
    expect(o.detailed).toBe(false);
    expect(o.detailToggle?.getAttribute('name')).toContain('UdvidCB');
    expect(o.holds[0].regular).toEqual({ period: { absent: 2, total: 14, percent: null }, settled: { absent: null, total: null, percent: 12.5 } });
    expect(o.total.regular.settled).toEqual({ absent: null, total: null, percent: 6.9 });
    expect(o.total.written.settled).toMatchObject({ absent: 1, total: 90 });
    expect(o.remarks).toEqual([]);
  });

  it('throws on unexpected markup', () => {
    expect(() => readAbsenceOverview(parseDocument('<form><table><tr><td>x</td></tr></table></form>', url))).toThrow();
  });
});

describe('breakdown', () => {
  const o = readAbsenceOverview(parseDocument(absenceOverviewPage('/lectio/123/'), 'https://www.lectio.dk/lectio/123/subnav/fravaerelev.aspx'));
  it('splits the absence by hold, largest first', () => {
    const b = breakdown(o.holds, 'regular', 'settled');
    expect(b.absent).toBe(9);
    expect(b.slices.map((s) => s.hold)).toEqual(['3a Da', '3a Ma', '3a En', '3a Fy']);
    expect(b.slices[0].share).toBeCloseTo(4 / 9);
    expect(b.slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
    expect(b.clean).toEqual(['3a Id']);
  });
  it('leaves out holds without counts', () => {
    const b = breakdown(o.holds, 'written', 'period');
    expect(b.slices.map((s) => s.hold)).toEqual(['3a Da']);
    expect(b.clean).toEqual(['3a Ma', '3a En']);
  });
});
