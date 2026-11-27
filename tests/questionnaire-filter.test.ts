// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { readQuestionnaires } from '@/lib/lectio/readers/questionnaire.js';
import { PREFS_DEFAULT, hideKey, ownerKind, sortOpen, toggleHidden, type QuestionnairesData } from '@/features/questionnaires/model';
import { questionnaireListPage } from '../scripts/questionnaire-fixture.mjs';

const q = (id: string, owner: string, ownerId = '') => ({ id, title: `Skema ${id}`, owner, ownerId });

describe('questionnaire owners', () => {
  it('tells teachers from students by the suffix Lectio puts on names', () => {
    expect(ownerKind({ owner: 'Lene Madsen (lm)' })).toBe('teacher');
    expect(ownerKind({ owner: 'Emma Larsen (2b 04)' })).toBe('student');
    expect(ownerKind({ owner: 'Jonathan Hansen(k) (1x 17)' })).toBe('student');
    expect(ownerKind({ owner: 'Studievejledningen' })).toBeNull();
  });

  it('prefers a context card when there is one', () => {
    expect(ownerKind({ owner: 'Lene Madsen', ownerId: 'T123' })).toBe('teacher');
    expect(ownerKind({ owner: 'Emma Larsen', ownerId: 'S456' })).toBe('student');
  });

  it('reads the owners of the fixture list', () => {
    const doc = parseDocument(questionnaireListPage('/lectio/123/', {}), 'https://www.lectio.dk/lectio/123/spoergeskema/spoergeskema_rapport.aspx');
    const data = readQuestionnaires(doc) as QuestionnairesData;
    expect(data.open.map(ownerKind)).toEqual(['teacher', 'student']);
    expect(data.open[0].ownerId).toBe('');
  });
});

describe('hiding and filtering open questionnaires', () => {
  const open = [q('1', 'Lene Madsen (lm)'), q('2', 'Emma Larsen (2b 04)'), q('3', 'Studievejledningen'), q('4', 'Ida Kjær (1c 03)')];

  it('shows everything by default and offers the filter when both kinds are there', () => {
    const r = sortOpen(open, PREFS_DEFAULT);
    expect(r.shown.map((x) => x.id)).toEqual(['1', '2', '3', '4']);
    expect(r).toMatchObject({ hidden: [], filtered: 0, canFilter: true });
  });

  it('keeps hidden ones apart and filters student-made ones, keeping unknown owners', () => {
    const r = sortOpen(open, { hidden: ['4'], teachersOnly: true });
    expect(r.shown.map((x) => x.id)).toEqual(['1', '3']);
    expect(r.hidden.map((x) => x.id)).toEqual(['4']);
    expect(r.filtered).toBe(1);
  });

  it('does not offer the filter when the owners cannot be told apart', () => {
    const r = sortOpen([q('1', 'Studievejledningen'), q('2', 'Emma Larsen (2b 04)')], { hidden: [], teachersOnly: true });
    expect(r.canFilter).toBe(false);
    expect(r.shown).toHaveLength(2);
  });

  it('toggles hidden keys and forgets questionnaires that are gone', () => {
    let prefs = toggleHidden(PREFS_DEFAULT, '1');
    expect(prefs.hidden).toEqual(['1']);
    prefs = toggleHidden({ ...prefs, hidden: ['1', 'old'] }, '2', ['1', '2']);
    expect(prefs.hidden).toEqual(['1', '2']);
    expect(toggleHidden(prefs, '1').hidden).toEqual(['2']);
  });

  it('keys questionnaires without an id by title and owner', () => {
    expect(hideKey({ id: null, title: 'Trivsel', owner: 'Lene Madsen (lm)' })).toBe('Trivsel|Lene Madsen (lm)');
  });
});
