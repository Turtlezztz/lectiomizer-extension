// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NotLoggedInError, parseDocument } from '@/lib/lectio/client';
import { createLectioTools, resolveUrl, when } from '@/lib/agent/tools';
import { TOOL_SPECS } from '@/lib/agent/tool-specs.js';

const index: Record<string, string> = JSON.parse(readFileSync('fixtures/index.json', 'utf8'));
const norm = (raw: string) => {
  const u = new URL(raw, 'https://www.lectio.dk');
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  return u.pathname.toLowerCase() + (params.length ? '?' + new URLSearchParams(params).toString().toLowerCase() : '');
};
const load = async (url: string) => {
  // scripts/gen-fixtures.mjs writes one open thread, under ?demo=traad.
  const key = /type=showthread/i.test(url) ? '/lectio/123/beskeder2.aspx?demo=traad' : norm(url);
  const file = index[key] || Object.entries(index).find(([k]) => k.split('?')[0] === key.split('?')[0])?.[1];
  if (!file) throw new Error('no fixture ' + key);
  return parseDocument(readFileSync('fixtures/' + file, 'utf8'), url);
};
const tools = (links: 'relative' | 'absolute' = 'relative') => createLectioTools({ schoolId: '123', load, links, now: () => new Date(2026, 10, 16, 9, 0) });

describe('agent tools', () => {
  it('every spec has a handler and strict parameters', async () => {
    for (const spec of TOOL_SPECS) {
      expect(spec.parameters.additionalProperties).toBe(false);
      expect(spec.parameters.required).toEqual(Object.keys(spec.parameters.properties));
    }
  });
  it('runs each tool on the fixtures', async () => {
    const t = tools();
    const cases: Array<[string, any]> = [
      ['get_overview', {}], ['get_schedule', { start: null, days: 7 }], ['list_assignments', { status: null, search: null }],
      ['get_assignment', { id: '1001' }], ['get_lesson', { id: '5001' }], ['list_messages', { search: null, limit: null }],
      ['read_message', { id: '1' }], ['get_grades', {}], ['get_absence', {}], ['read_page', { url: 'material_lektieoversigt.aspx' }],
    ];
    for (const [name, args] of cases) {
      const r = await t.run(name, args);
      expect(r.ok, `${name}: ${r.text}`).toBe(true);
      expect(r.text.length, name).toBeGreaterThan(40);
    }
  });

  it('gives the ids the next tool takes', async () => {
    const t = tools();
    const overview = (await t.run('get_overview')).text;
    expect(overview).toMatch(/\[3a Da\]\(aktivitet\/aktivitetforside2\.aspx\?absid=01\).*lektion-id 01/);
    expect(overview).toMatch(/Novelleanalyse.*opgave-id 1\b/);
    const list = (await t.run('list_assignments', { status: 'missing', search: null })).text;
    expect(list).toMatch(/Essay on technology.*opgave-id 3/);
    expect(list).not.toMatch(/Rapport om energi/);
    expect((await t.run('list_assignments', { status: 'handed_in', search: 'fy' })).text).toMatch(/1 af 4[\s\S]*Rapport om energi/);
    expect((await t.run('list_messages', { search: 'ekskursion', limit: 5 })).text).toMatch(/1 af 1\)[\s\S]*besked-id 0/);
    const schedule = await t.run('get_schedule', { start: '2026-10-05', days: 3 });
    expect(schedule.text).toMatch(/mandag den 5\. oktober 2026[\s\S]*lektion-id/);
    expect(schedule.label).toBe('Læste skemaet 5/10–7/10');
  });

  it('reads message threads, which v1 could not', async () => {
    const r = await tools().run('read_message', { id: '1' });
    expect(r.text).toMatch(/Modtagere: Lene Madsen/);
    expect(r.text).toMatch(/Husk madpakke og buskort/);
    expect(r.text).toMatch(/Vedhæftning: \[Program\.pdf\]\(dokumenthent\.aspx/);
  });

  it('writes absolute links for MCP clients', async () => {
    const r = await tools('absolute').run('get_assignment', { id: '1001' });
    expect(r.text).toMatch(/\]\(https:\/\/www\.lectio\.dk\/lectio\/123\/ExerciseFileGet\.aspx/);
  });

  it('downloads documents as files, and refuses other sites and bad ids', async () => {
    const download = async (url: string) =>
      new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="Novelle.pdf"` } });
    const t = createLectioTools({ schoolId: '123', load, download });
    const r = await t.run('read_document', { url: 'ExerciseFileGet.aspx?type=opgavedef&exercisefileid=1' });
    expect(r.ok).toBe(true);
    expect(r.files?.[0]).toMatchObject({ name: 'Novelle.pdf', mime: 'application/pdf', kind: 'file' });
    expect(r.label).toBe('Hentede Novelle.pdf');
    const evil = await t.run('read_document', { url: 'https://evil.example/x.pdf' });
    expect(evil.ok).toBe(false);
    expect((await t.run('get_assignment', { id: '1 OR 1=1' })).ok).toBe(false);
    expect((await t.run('hand_in', {})).ok).toBe(false);
  });

  it('says when the Lectio session has expired', async () => {
    const t = createLectioTools({ schoolId: '123', load: async () => { throw new NotLoggedInError(); } });
    const r = await t.run('get_grades', {});
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/sessionen er udløbet/);
  });

  it('urls stay on the school', () => {
    expect(() => resolveUrl('https://evil.example/x', '123')).toThrow();
    expect(() => resolveUrl('/lectio/999/forside.aspx', '123')).toThrow();
    expect(() => resolveUrl('logout.aspx', '123')).toThrow();
    expect(resolveUrl('https://lectio.dk/lectio/123/OpgaverElev.aspx', '123').href).toBe('https://www.lectio.dk/lectio/123/OpgaverElev.aspx');
    expect(when(new Date(2026, 9, 9, 23, 59), new Date(2026, 0, 1))).toBe('fre 9/10 kl. 23:59');
  });
});
