// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LectioHttpError, NotLoggedInError, parseDocument } from '@/lib/lectio/client';
import { emptyIndex, isSavable, isUnreachable, loadSavedPage, planSave, savePage, serialisePage, type SavedEntry } from '@/lib/lectio/offline';

const base = 'https://www.lectio.dk/lectio/123/';
const entry = (url: string, size = 10, hash = 'h'): SavedEntry => ({ url, key: `k:${url}`, savedAt: Date.now(), size, hash });

describe('isSavable', () => {
  it('keeps the student’s own pages only', () => {
    expect(isSavable(`${base}forside.aspx`)).toBe(true);
    expect(isSavable(`${base}SkemaNy.aspx?week=482026`)).toBe(true);
    expect(isSavable(`${base}OpgaverElev.aspx`)).toBe(true);
    expect(isSavable(`${base}material_lektieoversigt.aspx`)).toBe(true);
    expect(isSavable(`${base}SkemaNy.aspx?type=lokale&id=1`)).toBe(false);
    expect(isSavable(`${base}SkemaNy.aspx?type=elev&elevid=9`)).toBe(false);
    expect(isSavable(`${base}beskeder2.aspx`)).toBe(false);
    expect(isSavable('https://example.com/forside.aspx')).toBe(false);
  });
});

describe('isUnreachable', () => {
  it('treats network errors and server errors as unreachable, not logins or 404s', () => {
    expect(isUnreachable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isUnreachable(new LectioHttpError(503))).toBe(true);
    expect(isUnreachable(new LectioHttpError(404))).toBe(false);
    expect(isUnreachable(new NotLoggedInError())).toBe(false);
    expect(isUnreachable(new Error('Opgavelisten blev ikke fundet'))).toBe(false);
  });
});

describe('planSave', () => {
  it('puts the newest first and evicts the oldest beyond the caps', () => {
    let index = emptyIndex();
    const limits = { entries: 2, total: 100, page: 100 };
    index = planSave(index, entry('a'), 's1', limits).index;
    index = planSave(index, entry('b'), 's1', limits).index;
    const plan = planSave(index, entry('c'), 's1', limits);
    expect(plan.index.entries.map((e) => e.url)).toEqual(['c', 'b']);
    expect(plan.drop).toEqual(['k:a']);
    expect(plan.write).toBe(true);
  });

  it('evicts by total size', () => {
    let index = emptyIndex();
    const limits = { entries: 10, total: 25, page: 100 };
    index = planSave(index, entry('a', 10), 's1', limits).index;
    index = planSave(index, entry('b', 10), 's1', limits).index;
    const plan = planSave(index, entry('c', 10), 's1', limits);
    expect(plan.index.entries.map((e) => e.url)).toEqual(['c', 'b']);
    expect(plan.drop).toEqual(['k:a']);
  });

  it('skips rewriting unchanged HTML but refreshes its place', () => {
    let index = emptyIndex();
    index = planSave(index, entry('a', 10, 'x'), 's1').index;
    index = planSave(index, entry('b', 10, 'y'), 's1').index;
    const plan = planSave(index, entry('a', 10, 'x'), 's1');
    expect(plan.write).toBe(false);
    expect(plan.index.entries.map((e) => e.url)).toEqual(['a', 'b']);
  });

  it('starts over when another student signs in', () => {
    const index = planSave(emptyIndex(), entry('a'), 's1').index;
    const plan = planSave(index, entry('b'), 's2');
    expect(plan.index).toMatchObject({ owner: 's2' });
    expect(plan.index.entries.map((e) => e.url)).toEqual(['b']);
    expect(plan.drop).toEqual(['k:a']);
  });
});

describe('save and load', () => {
  it('round-trips a page without its view state', async () => {
    const url = `${base}forside.aspx`;
    const html = '<html><head><title>x</title></head><body><form><input type="hidden" name="__VIEWSTATE" value="AAAA"></form><a href="logout.aspx">Log ud</a><p id="p">Hej</p></body></html>';
    const doc = parseDocument(html, url);
    expect(serialisePage(doc)).not.toContain('AAAA');
    await savePage('123', url, doc, '42');
    const saved = await loadSavedPage('123', url);
    expect(saved?.doc.querySelector('#p')?.textContent).toBe('Hej');
    expect(saved?.doc.URL).toBe(url);
    expect(saved?.doc.querySelectorAll('base')).toHaveLength(1);
    expect(await loadSavedPage('123', `${base}OpgaverElev.aspx`)).toBeNull();
  });
});
