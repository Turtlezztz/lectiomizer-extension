// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from '@/lib/lectio/client';
import { readAssignments } from '@/lib/lectio/readers/assignments.js';
import { readAssignment, readDocumentChooser } from '@/lib/lectio/readers/assignment.js';
import {
  checkboxTarget, displayName, documentLabel, exerciseId, groupAssignments, groupOf, hoursLabel, matches, splitStudentStatus,
  type AssignmentItem,
} from '@/features/assignments/model';

const item = (over: Partial<AssignmentItem>): AssignmentItem => ({
  title: 'Opgave', href: null, hold: '3a Da', week: '', deadlineText: '', deadline: null, studentTime: '', status: 'Venter', statusKind: 'waiting',
  absence: '', absencePercent: null, awaiting: '', note: '', grade: '', studentNote: '', ...over,
});
const now = new Date(2026, 9, 10, 12, 0);

describe('assignment grouping', () => {
  it('puts overdue waiting assignments under Mangler', () => {
    expect(groupOf(item({ deadline: new Date(2026, 9, 9) }), now)).toBe('missing');
    expect(groupOf(item({ deadline: new Date(2026, 9, 12) }), now)).toBe('upcoming');
    expect(groupOf(item({ statusKind: 'missing', deadline: new Date(2026, 9, 12) }), now)).toBe('missing');
    expect(groupOf(item({ statusKind: 'delivered', deadline: new Date(2026, 9, 1) }), now)).toBe('delivered');
    expect(groupOf(item({ deadline: null }), now)).toBe('upcoming');
  });
  it('sorts upcoming soonest first and the rest newest first', () => {
    const a = item({ title: 'a', deadline: new Date(2026, 9, 20) });
    const b = item({ title: 'b', deadline: new Date(2026, 9, 11) });
    const c = item({ title: 'c', statusKind: 'delivered', deadline: new Date(2026, 8, 1) });
    const d = item({ title: 'd', statusKind: 'delivered', deadline: new Date(2026, 9, 1) });
    const g = groupAssignments([a, b, c, d], now);
    expect(g.upcoming.map((x) => x.title)).toEqual(['b', 'a']);
    expect(g.delivered.map((x) => x.title)).toEqual(['d', 'c']);
  });
  it('filters on text and hold', () => {
    const a = item({ title: 'Novelleanalyse', hold: '3a Da', note: 'PDF' });
    expect(matches(a, 'novelle', '')).toBe(true);
    expect(matches(a, 'pdf', '3a Da')).toBe(true);
    expect(matches(a, '', '3a Ma')).toBe(false);
  });
});

describe('labels', () => {
  it('formats hours, documents and statuses', () => {
    expect(hoursLabel('4,00')).toBe('4 t');
    expect(hoursLabel('1,50')).toBe('1,5 t');
    expect(hoursLabel('4 timer')).toBe('4 t');
    expect(hoursLabel('')).toBeNull();
    expect(documentLabel('Novelleanalyse.docx (ma 5/10)')).toEqual({ name: 'Novelleanalyse.docx', meta: 'ma 5/10', ext: 'docx' });
    expect(splitStudentStatus('Venter / Fravær: 0%')).toEqual({ status: 'Venter', absence: '0%' });
    expect(displayName('Anna Andersen, 3a 01')).toBe('Anna Andersen');
    expect(displayName('Bjørn Lund (3a 05)')).toBe('Bjørn Lund');
    expect(exerciseId('https://www.lectio.dk/lectio/1/ElevAflevering.aspx?elevid=1&exerciseid=42')).toBe('42');
  });
});

describe('postback helpers', () => {
  const doc = (html: string) => parseDocument(`<form id="aspnetForm">${html}</form>`, 'https://www.lectio.dk/lectio/1/a.aspx');
  it('finds the event target of AutoPostBack checkboxes', () => {
    const d = doc(`<input type="checkbox" id="a" name="s$m$a" onclick="javascript:setTimeout('__doPostBack(\\'s$m$a\\',\\'\\')', 0)"><input type="checkbox" id="b" name="s$m$b">`);
    expect(checkboxTarget(d.getElementById('a')!)).toBe('s$m$a');
    expect(checkboxTarget(d.getElementById('b')!)).toBe('s$m$b');
  });
  it("reads Lectio's document chooser in the hand-in panel", () => {
    const d = doc(`<div id="m_Content_ElectronicHandInPanel"><div id="m_Content_choosedocument_panel"><input type="hidden" name="m$Content$choosedocument$selectedDocumentId"><a id="m_Content_choosedocument_choosedocBtn" onclick="return m_Content_choosedocument_activate(); return false;">Vælg dokument og send</a></div></div>`);
    expect(readDocumentChooser(d.querySelector('[id$="ElectronicHandInPanel"]'))).toEqual({
      field: 'm$Content$choosedocument$selectedDocumentId', target: 'm$Content$choosedocument', argument: 'documentId',
    });
    expect(readDocumentChooser(doc('<input name="x">'))).toBeNull();
  });
});

describe('fixtures', () => {
  const index: Record<string, string> = (() => {
    try {
      return JSON.parse(readFileSync('fixtures/index.json', 'utf8'));
    } catch {
      return {};
    }
  })();
  const load = (path: string) => {
    const key = Object.keys(index).find((k) => k.startsWith('/lectio/123/' + path));
    return key ? parseDocument(readFileSync('fixtures/' + index[key], 'utf8'), 'https://www.lectio.dk' + key) : null;
  };
  it.skipIf(!Object.keys(index).length)('every list row links to an in-app assignment', () => {
    const data = readAssignments(load('opgaverelev.aspx')!);
    expect(data.assignments.every((a) => exerciseId(a.href))).toBe(true);
  });
  it.skipIf(!Object.keys(index).length)('the detail page exposes its actions', () => {
    const data = readAssignment(load('elevaflevering.aspx')!);
    expect(data.handIn?.comment?.getAttribute('name')).toBeTruthy();
    expect(data.group?.add?.select.getAttribute('name')).toBeTruthy();
    expect(data.group?.members.some((m: any) => m.remove)).toBe(true);
  });
});
