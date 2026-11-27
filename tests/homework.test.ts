// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { appRoute } from '@/lib/lectio/paths';
import { readHomework } from '@/lib/lectio/readers/homework.js';
import { groupByDay, type HomeworkData } from '@/features/homework/model';
import { homeworkPage } from '../scripts/homework-fixture.mjs';

const URL_ = 'https://www.lectio.dk/lectio/123/material_lektieoversigt.aspx';
const read = (opts = {}) => readHomework(parseDocument(homeworkPage('/lectio/123/', opts), URL_), new Date(2026, 10, 27)) as HomeworkData;

describe('readHomework', () => {
  it('reads one row per lesson from the desktop cells', () => {
    const { rows } = read();
    expect(rows).toHaveLength(3);
    expect(rows[0].lesson).toMatchObject({ title: 'Novelleanalyse', holds: ['3a Da'], teachers: ['lm'], room: 'A12', module: '2. modul', status: 'normal' });
    expect(rows[0].start).toEqual(new Date(2026, 10, 30, 9, 20));
    expect(rows[0].end).toEqual(new Date(2026, 10, 30, 10, 20));
    expect(rows[0].items.map((i) => i.title)).toEqual(['Læs novellen', 'Find tre citater']);
    expect(rows[0].details).toContain('Note:\nHusk computer');
    expect(appRoute(rows[0].lesson.href)).toBe('/lesson/5001');
  });
  it('fills shortened bricks from the tooltip', () => {
    const { rows } = read();
    expect(rows[2].lesson).toMatchObject({ title: 'Lektiecafé', status: 'changed', room: 'Forhal', module: '6. modul', teachers: ['lm', 'tn', 'ms'] });
    expect(rows[2].lesson.holds).toHaveLength(3);
    expect(rows[2].items).toHaveLength(1);
  });
  it('reads a page without homework', () => {
    expect(read({ empty: true }).rows).toEqual([]);
  });
  it('rejects a page that is not Lectio content', () => {
    expect(() => readHomework(parseDocument('<html><body></body></html>', URL_))).toThrow();
  });
});

describe('homework page', () => {
  it('groups lessons by day', () => {
    const days = groupByDay(read().rows);
    expect(days.map((d) => d.rows.length)).toEqual([2, 1]);
    expect(days[1].date).toEqual(new Date(2026, 11, 3, 14, 30));
  });
  it('routes Lectio links to the page', () => {
    expect(appRoute(URL_)).toBe('/homework');
  });
});
