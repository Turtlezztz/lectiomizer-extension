import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SimBar, SimGrade, TrendMark } from '@/features/grades/SimControls';
import { gradeTrend, summarize, weightedMean, type Diploma, type Grade } from '@/features/grades/grade-utils';
import {
  bonusFactor, cleanLines, cleanOverrides, customItemId, editedItems, suggestLines, simSource, targetText, diplomaItemId, diplomaItems, neededForTarget, parseTarget, simulate, standpunktItemId, standpunktItems, type SimItem,
} from '@/features/grades/simulator';

const g = (value: string, type: string, extra: Partial<Grade> = {}): Grade => ({ type, value, final: false, extra: [], xprs: null, source: null, weight: '1', ...extra });
const r = (label: string, karakter: string | null, vaegt: string | null) => ({ label, fields: { 'Vægt': vaegt, Karakter: karakter, ECTS: null }, empty: !karakter && !vaegt });

const diploma: Diploma = {
  title: 'HTX v4',
  groups: ['Årskarakter', 'Eksamenskarakter'],
  lines: [
    { subject: 'Dansk A, skr.', results: [r('Årskarakter', '10', '2,00'), r('Eksamenskarakter', '7', '2,00')] },
    { subject: 'Dansk A, mdt.', results: [r('Årskarakter', '12', '2,00'), r('Eksamenskarakter', null, null)] },
    { subject: 'Kemi B, mdt.', results: [r('Årskarakter', '10', '0,75'), r('Eksamenskarakter', '7', '1,5')] },
    { subject: 'Idræt C', results: [r('Årskarakter', 'Bestået', '1'), r('Eksamenskarakter', null, null)] },
  ],
  averages: [
    { label: 'Eksamensresultat ekskl. bonus', value: '9,0', note: null },
    { label: 'Eksamensresultat inkl. evt. bonus', value: '9,3', note: null },
  ],
};

describe('weightedMean', () => {
  it('weights and handles empty input', () => {
    expect(weightedMean([{ value: 12, weight: 2 }, { value: 7, weight: 1 }])).toBeCloseTo(31 / 3);
    expect(weightedMean([])).toBeNull();
  });
  it('is what summarize uses for the weighted average', () => {
    const subjects = [{ subject: 'Kemi B', hold: '', forms: [{ form: '', grades: [g('4', '1.standpunkt', { weight: '0,5' })] }, { form: 'x', grades: [g('10', 'Årskarakter')] }] }];
    expect(summarize(subjects).weighted).toBeCloseTo((4 * 0.5 + 10) / 1.5);
  });
});

describe('diplomaItems', () => {
  it('reads every 7-point cell, guesses weights for empty ones, skips Bestået', () => {
    const items = diplomaItems(diploma);
    expect(items.map((i) => i.id)).toEqual([
      diplomaItemId('Dansk A, skr.', 'Årskarakter'), diplomaItemId('Dansk A, skr.', 'Eksamenskarakter'),
      diplomaItemId('Dansk A, mdt.', 'Årskarakter'), diplomaItemId('Dansk A, mdt.', 'Eksamenskarakter'),
      diplomaItemId('Kemi B, mdt.', 'Årskarakter'), diplomaItemId('Kemi B, mdt.', 'Eksamenskarakter'),
      diplomaItemId('Idræt C', 'Eksamenskarakter'),
    ]);
    const oralExam = items[3];
    expect(oralExam).toMatchObject({ value: null, weight: 2, assumedWeight: true });
    expect(items[5]).toMatchObject({ value: 7, weight: 1.5, assumedWeight: false });
    expect(items[6]).toMatchObject({ value: null, weight: 1, assumedWeight: true });
  });
});

describe('simulate', () => {
  const items = diplomaItems(diploma);
  const base = (10 * 2 + 7 * 2 + 12 * 2 + 10 * 0.75 + 7 * 1.5) / (2 + 2 + 2 + 0.75 + 1.5);

  it('matches the plain weighted mean without overrides', () => {
    const s = simulate(items, {}, 1.03);
    expect(s.average).toBeCloseTo(base);
    expect(s.withBonus).toBeCloseTo(base * 1.03);
    expect(s.count).toBe(5);
    expect(s.changed).toBe(0);
  });
  it('replaces existing grades and fills in missing ones', () => {
    const s = simulate(items, { [diplomaItemId('Dansk A, skr.', 'Eksamenskarakter')]: '12', [diplomaItemId('Dansk A, mdt.', 'Eksamenskarakter')]: '10' });
    expect(s.average).toBeCloseTo((10 * 2 + 12 * 2 + 12 * 2 + 10 * 0.75 + 7 * 1.5 + 10 * 2) / (2 + 2 + 2 + 0.75 + 1.5 + 2));
    expect(s.count).toBe(6);
    expect(s.changed).toBe(2);
    expect(s.withBonus).toBeNull();
  });
  it('leaves "?" out of the average', () => {
    const s = simulate(items, { [diplomaItemId('Dansk A, skr.', 'Eksamenskarakter')]: '?' });
    expect(s.count).toBe(4);
  });
  it('returns null with nothing to average', () => {
    expect(simulate([], {}).average).toBeNull();
  });
});

describe('neededForTarget', () => {
  // Two fixed grades 10 and 4 (weight 1 each), two missing with weight 1.
  const items: SimItem[] = [
    { id: 'a', value: 10, weight: 1, assumedWeight: false },
    { id: 'b', value: 4, weight: 1, assumedWeight: false },
    { id: 'c', value: null, weight: 1, assumedWeight: true },
    { id: 'd', value: null, weight: 1, assumedWeight: true },
  ];
  const rest = { c: '?', d: '7' } as const;

  it('computes the average the remaining grades need', () => {
    expect(neededForTarget(items, rest, 8)).toEqual({ kind: 'needed', count: 2, average: 9 });
  });
  it('ignores the guessed value of a remaining grade but uses replaced fixed ones', () => {
    expect(neededForTarget(items, { ...rest, b: '12' }, 8)).toEqual({ kind: 'needed', count: 2, average: 5 });
  });
  it('says when the target is out of reach or already secured', () => {
    const high = neededForTarget(items, rest, 11.5);
    expect(high.kind).toBe('unreachable');
    if (high.kind === 'unreachable') expect(high.best).toBeCloseTo(9.5);
    expect(neededForTarget(items, rest, 2)).toEqual({ kind: 'secured', count: 2 });
  });
  it('reads the target as "with bonus" when there is a factor', () => {
    const res = neededForTarget(items, rest, 8 * 1.06, 1.06);
    expect(res.kind).toBe('needed');
    if (res.kind === 'needed') expect(res.average).toBeCloseTo(9);
  });
  it('without remaining grades reports whether the current average reaches it', () => {
    expect(neededForTarget(items, {}, 7)).toEqual({ kind: 'none', reached: true });
    expect(neededForTarget(items, {}, 7.5)).toEqual({ kind: 'none', reached: false });
    expect(neededForTarget([], {}, 7)).toEqual({ kind: 'none', reached: null });
  });
  it('treats "?" on an existing grade as remaining', () => {
    expect(neededForTarget(items.slice(0, 2), { b: '?' }, 11)).toEqual({ kind: 'needed', count: 1, average: 12 });
  });
});

describe('helpers', () => {
  it('derives the bonus factor from Lectio\'s two figures', () => {
    expect(bonusFactor(diploma.averages)).toBe(1.03);
    expect(bonusFactor([{ label: 'Eksamensresultat ekskl. bonus', value: '8,4', note: null }, { label: 'Eksamensresultat inkl. evt. bonus', value: '8,9', note: null }])).toBe(1.06);
    expect(bonusFactor([{ label: 'Eksamensresultat ekskl. bonus', value: '8,4', note: null }, { label: 'Eksamensresultat inkl. evt. bonus', value: '8,4', note: null }])).toBe(1);
    expect(bonusFactor([{ label: 'Eksamensresultat ekskl. bonus', value: '8,4', note: null }])).toBeNull();
  });
  it('parses a target and cleans stored overrides', () => {
    expect(parseTarget('10,0')).toBe(10);
    expect(parseTarget('9.5')).toBe(9.5);
    expect(parseTarget('13')).toBeNull();
    expect(parseTarget('')).toBeNull();
    expect(cleanOverrides({ a: '12', b: '5', c: '?', d: 7 })).toEqual({ a: '12', c: '?' });
    expect(cleanOverrides(null)).toEqual({});
  });
  it('builds standpunkt items from the latest grade per form', () => {
    const items = standpunktItems([{ subject: 'Dansk A', hold: '3a Da', forms: [{ form: 'Skriftlig', grades: [g('7', '1.standpunkt'), g('10', '2.standpunkt', { weight: '0,5' })] }, { form: 'Mundtlig', grades: [g('B', 'Årskarakter')] }] }]);
    expect(items).toEqual([{ id: standpunktItemId('Dansk A', '3a Da', 'Skriftlig'), value: 10, weight: 0.5, assumedWeight: false }]);
  });
});

describe('gradeTrend', () => {
  it('follows standpunkter and årskarakter, not prøver', () => {
    const t = gradeTrend([g('7', '1.standpunkt'), g('10', '2.standpunkt'), g('12', 'Intern prøve'), g('10', 'Årskarakter'), g('02', 'Eksamens-/årsprøvekarakter')]);
    expect(t?.points.map((p) => p.value)).toEqual([7, 10, 10]);
    expect(t).toMatchObject({ delta: 3, direction: 'up' });
  });
  it('reports down, unchanged and too little data', () => {
    expect(gradeTrend([g('10', '1.standpunkt'), g('7', 'Afsluttende års-/standpunktskarakter')])?.direction).toBe('down');
    expect(gradeTrend([g('7', '1.standpunkt'), g('7', '2.standpunkt')])?.direction).toBe('same');
    expect(gradeTrend([g('7', '1.standpunkt'), g('B', '2.standpunkt')])).toBeNull();
  });
});

describe('targetText', () => {
  it('phrases each outcome', () => {
    expect(targetText('', null)).toBe('');
    expect(targetText('15', null)).toMatch(/mellem -3 og 12/);
    expect(targetText('10', { kind: 'needed', count: 3, average: 9.04 })).toBe('Kræver 9,1 i snit i de 3 manglende.');
    expect(targetText('10', { kind: 'needed', count: 1, average: 9 })).toBe('Kræver 9,0 i snit i den manglende karakter.');
    expect(targetText('12', { kind: 'unreachable', count: 2, best: 9.46 })).toMatch(/Kan ikke nås – højst 9,5/);
    expect(targetText('2', { kind: 'secured', count: 2 })).toMatch(/^Sikret/);
    expect(targetText('7', { kind: 'none', reached: true })).toMatch(/^Nået/);
  });
});

describe('simSource', () => {
  const current = { types: [], subjects: [{ subject: 'Dansk A', hold: '', forms: [{ form: '', grades: [g('7', '1.standpunkt')] }] }], empty: null };
  const base = { term: null, notices: [], current, notes: null, remarks: null, protocol: null };
  it('prefers the diploma, with Lectio\'s bonus', () => {
    const src = simSource({ ...base, diplomas: [{ error: 'x' }, diploma] });
    expect(src?.kind).toBe('diploma');
    expect(src?.bonus).toBe(1.03);
  });
  it('falls back to standpunkter, then nothing', () => {
    expect(simSource({ ...base, diplomas: [] })?.kind).toBe('standpunkt');
    expect(simSource({ ...base, current: { types: [], subjects: [], empty: '' }, diplomas: [] })).toBeNull();
  });
});

describe('simulator UI (static render)', () => {
  const noop = () => {};
  it('marks simulated chips and shows the averages', () => {
    const chip = renderToStaticMarkup(createElement(SimGrade, { label: 'Dansk', original: '7', override: '10', onChange: noop }));
    expect(chip).toContain('outline-dashed');
    expect(chip).toContain('>10<');
    const src = simSource({ term: null, notices: [], current: { types: [], subjects: [], empty: '' }, notes: null, remarks: null, protocol: null, diplomas: [diploma] })!;
    const bar = renderToStaticMarkup(createElement(SimBar, { source: src, overrides: { [diplomaItemId('Dansk A, skr.', 'Eksamenskarakter')]: '12' }, target: '10', onTarget: noop, onReset: noop, onClose: noop }));
    expect(bar).toContain('Eksamenssnit');
    expect(bar).toContain('Med bonus');
    expect(bar).toContain('Nulstil');
    expect(bar).toMatch(/Ikke nået endnu|Nået/);
    const trend = renderToStaticMarkup(createElement(TrendMark, { trend: gradeTrend([g('7', '1.standpunkt'), g('10', '2.standpunkt')])! }));
    expect(trend).toContain('+3');
  });
});

describe('adding and removing diploma lines', () => {
  // The real shape: last year's subjects are on the diploma, this year's are not.
  const bevis: Diploma = {
    title: 'HTX v4',
    groups: ['Årskarakter', 'Eksamenskarakter'],
    lines: [
      { subject: 'Engelsk B, skr.', results: [r('Årskarakter', '7', '0,75'), r('Eksamenskarakter', '7', '0,75')] },
      { subject: 'Samfundsfag C', results: [r('Årskarakter', '10', '1'), r('Eksamenskarakter', null, null)] },
    ],
    averages: [],
  };
  const year = [
    { subject: 'Dansk A', hold: 'L3d DA', forms: [{ form: 'Skriftlig', grades: [g('7', '1.standpunkt')] }, { form: 'Mundtlig', grades: [g('10', '1.standpunkt')] }] },
    { subject: 'Samfundsfag B', hold: 'L3g Sa', forms: [{ form: 'Mundtlig', grades: [g('7', '1.standpunkt', { weight: '1,5' })] }] },
    { subject: 'Engelsk B', hold: 'x', forms: [{ form: 'Skriftlig', grades: [g('12', '1.standpunkt')] }] },
    { subject: 'Idræt C', hold: 'x', forms: [{ form: '', grades: [g('Bestået', '1.standpunkt')] }] },
  ];

  it('suggests this year\'s subjects, named like diploma lines, replacing lower levels', () => {
    const s = suggestLines(year, bevis);
    expect(s.map((l) => [l.subject, l.weight, l.grade])).toEqual([
      ['Dansk A, skr.', 1, '7'],
      ['Dansk A, mdt.', 1, '10'],
      ['Samfundsfag B', 1.5, '7'],
    ]);
    expect(s[2].replaces).toEqual(['Samfundsfag C']);
    expect(s[0].replaces).toEqual([]);
  });

  it('skips subjects already on the diploma or already added', () => {
    const s = suggestLines(year, bevis, [{ id: 'a', subject: 'dansk a, skr.', weight: 1 }]);
    expect(s.map((l) => l.subject)).not.toContain('Dansk A, skr.');
  });

  it('simulates with added lines and without removed ones', () => {
    const added = [{ id: 'a', subject: 'Samfundsfag B', weight: 1.5 }];
    const items = editedItems(bevis, { added, removed: ['Samfundsfag C'] });
    expect(items.map((i) => i.id)).toEqual([
      diplomaItemId('Engelsk B, skr.', 'Årskarakter'), diplomaItemId('Engelsk B, skr.', 'Eksamenskarakter'),
      customItemId('a', 'Årskarakter'), customItemId('a', 'Eksamenskarakter'),
    ]);
    // An added line counts only once it has a grade.
    expect(simulate(items, {}).average).toBeCloseTo(7);
    const res = simulate(items, { [customItemId('a', 'Årskarakter')]: '12' });
    expect(res.average).toBeCloseTo((7 * 0.75 * 2 + 12 * 1.5) / 3);
    expect(res.count).toBe(3);
  });

  it('matches Lectio on a real diploma (weighted mean of every grade)', () => {
    const line = (subject: string, y: [string, string], e?: [string, string]) => ({ subject, results: [r('Årskarakter', y[1], y[0]), e ? r('Eksamenskarakter', e[1], e[0]) : r('Eksamenskarakter', null, null)] });
    const real: Diploma = {
      ...bevis,
      lines: [
        line('Engelsk B, mdt.', ['0,75', '7']), line('Engelsk B, skr.', ['0,75', '7'], ['0,75', '7']),
        line('Fysik B, mdt.', ['0,75', '12']), line('Fysik B, skr.', ['0,75', '10']),
        line('Kemi B, mdt.', ['0,75', '12'], ['1,5', '4']), line('Kemi B, skr.', ['0,75', '12']),
        line('Teknologi B', ['1,5', '12']), line('Biologi C', ['1', '7'], ['1', '4']),
        line('Kommunikation og it C', ['1', '10']), line('Samfundsfag C', ['1', '10']),
        line('Naturvidenskabeligt grundforløb', ['0,25', '10']), line('Produktudvikling', ['0,25', '10']),
      ],
    };
    expect(simulate(diplomaItems(real), {}).average!.toFixed(1)).toBe('8.6');
  });

  it('drops malformed stored lines', () => {
    expect(cleanLines({ added: [{ id: 'a', subject: 'X', weight: 1 }, { id: 1 }, { id: 'b', subject: 'Y', weight: 0 }], removed: ['A', 3] })).toEqual({ added: [{ id: 'a', subject: 'X', weight: 1 }], removed: ['A'] });
    expect(cleanLines(null)).toEqual({ added: [], removed: [] });
  });
});
