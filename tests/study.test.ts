// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { appRoute } from '@/lib/lectio/paths';
import { readPhase, readStudyPlan } from '@/lib/lectio/readers/studyplan.js';
import { readDescriptions } from '@/lib/lectio/readers/descriptions.js';
import { readBooks, readSps, readStudentCard } from '@/lib/lectio/readers/student.js';
import type { DescriptionsData } from '@/features/descriptions/DescriptionsPage';
import { currentPhases, lanes, phaseState, place, timeline, type PhaseData, type StudyPlanData } from '@/features/studyplan/model';
import { booksPage, descriptionsPage, phasePage, spsPage, studentCardPage, studyPlanPage } from '../scripts/study-fixture.mjs';

const BASE = '/lectio/123/';
const doc = (html: string, path: string) => parseDocument(html, `https://www.lectio.dk${BASE}${path}`);
const plan = (opts = {}) => readStudyPlan(doc(studyPlanPage(BASE, opts), 'studieplan.aspx?displaytype=ugeteksttabel')) as StudyPlanData;

describe('readStudyPlan', () => {
  it('reads each hold with its phases from the tooltips', () => {
    const { holds } = plan();
    expect(holds.map((h) => [h.id, h.name])).toEqual([['800001', '3a Da'], ['800002', '3a Ma']]);
    expect(holds[0].phases[1]).toMatchObject({ id: '9102', title: 'Novelleanalyse', estimate: '8,00 moduler' });
    expect(holds[0].phases[1].start).toEqual(new Date(2026, 10, 23));
    expect(holds[0].phases[1].end).toEqual(new Date(2026, 11, 18));
    expect(holds[0].phases[2].title).toBe('Eksamensforberedelse & repetition');
    expect(appRoute(holds[0].phases[0].href)).toBe('/studyplan/9101');
  });
  it('reads exercises and elevtid per hold', () => {
    const [da, ma] = plan().holds;
    expect(da.exercises).toEqual([expect.objectContaining({ title: 'Analyse af "Skærmen"', studentHours: 3, deadline: new Date(2026, 11, 4, 23, 30) })]);
    expect(da.hours).toEqual({ total: 27, norm: 24 });
    expect(ma.hours).toEqual({ total: 40, norm: 45 });
  });
  it('reads an empty studieplan', () => {
    expect(plan({ empty: true }).holds).toEqual([]);
  });
  it('rejects a page that is not Lectio content', () => {
    expect(() => readStudyPlan(doc('<html><body></body></html>', 'studieplan.aspx'))).toThrow();
  });
});

describe('studieplan model', () => {
  const now = new Date(2026, 10, 27, 12);
  it('finds the running phases and what comes next', () => {
    const current = currentPhases(plan().holds, now);
    expect(current.map((c) => [c.hold.name, c.phase.title, c.next?.title])).toEqual([
      ['3a Da', 'Novelleanalyse', 'Eksamensforberedelse & repetition'],
      ['3a Ma', 'Differentialligninger', 'Projekt: modellering'],
    ]);
    expect(phaseState(plan().holds[0].phases[0], now)).toBe('past');
  });
  it('puts overlapping phases in separate lanes', () => {
    expect(lanes(plan().holds[1].phases).map((l) => l.map((p) => p.id))).toEqual([['9201', '9202'], ['9203']]);
  });
  it('places phases on a timeline of whole months', () => {
    const t = timeline(plan().holds, now)!;
    expect(t.start).toEqual(new Date(2026, 7, 1));
    expect(t.end).toEqual(new Date(2027, 4, 1));
    expect(t.months).toHaveLength(9);
    const pos = place(t, plan().holds[1].phases[0])!;
    expect(pos.left).toBeGreaterThan(0);
    expect(pos.left + pos.width).toBeLessThan(0.25);
  });
});

describe('readPhase', () => {
  const phase = () => readPhase(doc(phasePage(BASE), 'studieplan/forloeb_vis.aspx?phaseid=9102')) as PhaseData;
  it('reads the overview fields and written work', () => {
    const p = phase();
    expect(p.title).toBe('Novelleanalyse');
    const field = (l: string) => p.fields.find((f) => f.label === l)!;
    expect(field('Hold').lines).toEqual(['2025/26: 2a Da', '2026/27: 3a Da']);
    expect(field('Periode').text).toBe('23-11-2026 — 18-12-2026');
    expect(field('Forløbsbeskrivelse').node?.textContent).toContain('fortæller');
    expect(field('Særlige fokuspunkter').node).toBeNull();
    expect(p.fields.some((f) => f.label === 'Skriftligt arbejde')).toBe(false);
    expect(p.exercises).toEqual([expect.objectContaining({ title: 'Analyse af "Skærmen"', deadline: '04-12-2026' })]);
  });
  it('reads activities with a lesson link the app can open', () => {
    const [first, second] = phase().activities;
    expect(first.lesson).toMatchObject({ title: 'Novelleanalyse', module: '2. modul', room: 'A12', holds: ['3a Da'] });
    expect(appRoute(first.lesson!.href)).toBe('/lesson/5001');
    expect(first.note).toBe('Husk computer');
    expect(first.sections.map((s) => [s.title, s.items.map((i) => i.title)])).toEqual([['Lektier', ['Læs novellen']], ['Øvrigt indhold', ['Om novellen som genre']]]);
    expect(second.lesson?.status).toBe('changed');
    expect(second.sections).toEqual([]);
  });
  it('rejects a page without a forløb', () => {
    expect(() => readPhase(doc('<html><body><div id="contenttable"></div></body></html>', 'studieplan/forloeb_vis.aspx'))).toThrow();
  });
});

describe('readDescriptions', () => {
  const read = (opts = {}) => readDescriptions(doc(descriptionsPage(BASE, opts), 'studieplan/undervisningsbeskrivelse.aspx')) as DescriptionsData;
  it('reads the subjects and the selected one', () => {
    const { subjects } = read({ subject: '524' });
    expect(subjects).toEqual([{ id: '507', name: 'Dansk', selected: false }, { id: '524', name: 'Matematik', selected: true }]);
  });
  it('reads the stamdata and each forløb', () => {
    const [d] = read().descriptions;
    expect(d).toMatchObject({ term: '2024/25 - 2026/27', subject: 'Dansk A', teachers: 'Lene Madsen', hold: '2024 3a Da (3a Da)' });
    expect(d.phases.map((p) => [p.number, p.title])).toEqual([['1', 'Romantikken'], ['2', 'Novelleanalyse']]);
    expect(appRoute(d.phases[1].href)).toBe('/studyplan/9102');
    expect(d.phases[1].description?.textContent?.trim()).toBe('Tre noveller, fokus på fortæller.');
    expect(d.phases[1].fields.map((f) => f.label)).toEqual(['Indhold', 'Omfang', 'Særlige fokuspunkter', 'Væsentligste arbejdsformer']);
    expect(d.phases[1].fields[2].node).toBeNull();
  });
  it('reads a subject without a description', () => {
    const data = read({ empty: true });
    expect(data.descriptions).toEqual([]);
    expect(data.empty).toBe('Der er ingen undervisningsbeskrivelse');
  });
});

describe('readBooks', () => {
  const read = (opts = {}) => readBooks(doc(booksPage(BASE, opts), 'BD/UserReservations.aspx'));
  it('reads each loan from the desktop cells', () => {
    const { books, activeOnly } = read();
    expect(activeOnly).toBe(false);
    expect(books).toHaveLength(2);
    expect(books[0]).toMatchObject({ title: 'Antologi for 3.g (papirbog)', hold: '3a Da', returned: null, price: 349 });
    expect(books[0].due).toEqual(new Date(2027, 5, 30));
    expect(books[1]).toMatchObject({ price: 1250.5, returned: new Date(2026, 5, 20) });
  });
  it('reads the active-only state and an empty list', () => {
    expect(read({ activeOnly: true })).toMatchObject({ activeOnly: true });
    expect(read({ empty: true }).books).toEqual([]);
  });
});

describe('readSps', () => {
  it('reads a student without SPS', () => {
    const sps = readSps(doc(spsPage(BASE), 'Elev_SPS.aspx'));
    expect(sps.current).toBeNull();
    expect(sps.currentEmpty).toBe('Eleven har ingen indstillinger');
    expect(sps.settings.rows).toEqual([]);
    expect(sps.registrations.rows).toEqual([]);
  });
  it('reads settings and registrations', () => {
    const sps = readSps(doc(spsPage(BASE, { withData: true }), 'Elev_SPS.aspx'));
    expect(sps.current?.textContent).toContain('ordblindestøtte');
    expect(sps.settings).toMatchObject({ labels: ['Type', 'Periode'], rows: [['Ordblindestøtte', '2026/27']] });
    expect(sps.registrations.rows).toHaveLength(2);
  });
});

describe('readStudentCard', () => {
  it('reads the card and the QR code address from the page script', () => {
    const card = readStudentCard(doc(studentCardPage(BASE), 'digitaltStudiekort.aspx'));
    expect(card).toMatchObject({ name: 'Demo Elev', school: 'Demo Gymnasium', birthday: '1/1-2008 (18 år)', logo: null, qrRefreshMs: 36000 });
    expect(card.photo).toBe('https://www.lectio.dk/lectio/123/GetImage.aspx?pictureid=4242&fullsize=1');
    expect(card.qr).toBe('https://www.lectio.dk/lectio/123/GetImage.aspx?type=studiekortqr&studentid=9');
  });
});

describe('routes', () => {
  it('routes the Lectio pages to the app', () => {
    const r = (p: string) => appRoute(`https://www.lectio.dk${BASE}${p}`);
    expect(r('studieplan.aspx?displaytype=ugeteksttabel')).toBe('/studyplan');
    expect(r('studieplan.aspx?displaytype=ugeteksttabel&holdelementid=800001')).toBe('/studyplan?hold=800001');
    expect(r('studieplan/forloeb_vis.aspx?phaseid=9102&prevurl=x')).toBe('/studyplan/9102');
    expect(r('studieplan/forloeb_vis.aspx?phaseid=9102&lectab=uvb')).toBeNull();
    expect(r('studieplan/undervisningsbeskrivelse.aspx?sel_fag_id=507')).toBe('/descriptions?fag=507');
    expect(r('BD/UserReservations.aspx')).toBe('/books');
    expect(r('Elev_SPS.aspx')).toBe('/sps');
    expect(r('digitaltStudiekort.aspx')).toBe('/studentcard');
  });
});
