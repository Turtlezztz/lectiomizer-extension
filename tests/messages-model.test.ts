// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { readMessages } from '@/lib/lectio/readers/messages.js';
import { fixture } from '../legacy/demo/fixtures.mjs';
import { dropDown } from '../legacy/demo/views-fixtures.mjs';
import {
  composePath, groupThread, listNames, listPath, ownTitle, parseDirectory, rowMatches, searchDirectory, sourcesFromHtml, threadIdOf, threadPath,
} from '@/features/messages/model';
import type { MessagesData, ThreadMessage } from '@/features/messages/types';

const read = readMessages as unknown as (doc: Document) => MessagesData;
const page = (query: string) => {
  const url = `https://www.lectio.dk/lectio/123/beskeder2.aspx${query}`;
  return { html: fixture(`/lectio/123/beskeder2.aspx${query}`, false) as string, url };
};

describe('messages model', () => {
  it('takes thread ids from the row postback argument', () => {
    const { html, url } = page('');
    const data = read(parseDocument(html, url));
    expect(data.messages!.map((m, i) => threadIdOf(m, i))).toEqual(['0', '1', '2']);
    const a = document.createElement('a');
    a.setAttribute('onclick', "__doPostBack('__Page','$LB2$_MC_$_70144478283'); return false;");
    expect(threadIdOf({ open: a }, 5)).toBe('70144478283');
    expect(threadIdOf({ open: null }, 5)).toBe('row5');
  });

  it('builds Lectio paths', () => {
    expect(listPath(null)).toBe('beskeder2.aspx');
    expect(listPath('-40')).toBe('beskeder2.aspx?mappeid=-40');
    expect(threadPath('12')).toBe('beskeder2.aspx?type=showthread&id=12');
    expect(composePath('T1')).toBe('beskeder2.aspx?type=nybesked&sendids=T1');
  });

  it('filters rows on subject and people, ignoring accents', () => {
    const { html, url } = page('');
    const rows = read(parseDocument(html, url)).messages!;
    expect(rows.filter((r) => rowMatches(r, 'ekskursion lene')).length).toBe(1);
    expect(rows.filter((r) => rowMatches(r, 'elevradet')).length).toBe(1);
    expect(rows.filter((r) => rowMatches(r, '')).length).toBe(3);
  });

  it('groups a thread into days and sender runs', () => {
    const { html, url } = page('?demo=traad');
    const thread = read(parseDocument(html, url)).thread!;
    const items = groupThread(thread.messages);
    expect(items.filter((i) => i.type === 'day').map((i) => (i as { label: string }).label).slice(-2)).toEqual(['I går', 'I dag']);
    const runs = items.filter((i) => i.type === 'run') as Array<{ own: boolean; messages: ThreadMessage[] }>;
    expect(runs.map((r) => r.messages.length)).toEqual([2, 1, 2, 1, 1]);
    expect(runs[2].own).toBe(true);
    expect(thread.reply?.send).toBeTruthy();
  });

  it('only shows titles that differ from the subject', () => {
    expect(ownTitle('Re: Ekskursion fredag', 'Ekskursion fredag')).toBe('');
    expect(ownTitle('Fravær fredag', 'Ekskursion fredag')).toBe('Fravær fredag');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B og C');
    expect(listNames(['A', 'B', 'C', 'D'])).toBe('A, B og 2 andre');
  });

  it('finds recipient lists in the raw compose page and searches them', () => {
    const { html, url } = page('?demo=ny');
    const sources = sourcesFromHtml(html, url);
    expect(sources.map((s) => s.kind)).toEqual(['bcteacher', 'bcstudent', 'bchold', 'bcgroup']);
    expect(sources[0].url).toBe('https://www.lectio.dk/lectio/123/cache/DropDown.aspx?type=bcteacher&afdeling=1&dt=1');
    const items = sources.flatMap((s) => parseDirectory(dropDown(s.kind), s.kind));
    expect(searchDirectory(items, 'bjorn').map((i) => i.title)).toEqual(['Sofie Bjørn (3a 15)']);
    expect(searchDirectory(items, 'lene', (i) => i.key === 'T200001')).toEqual([]);
    expect(parseDirectory('not json', 'bcstudent')).toEqual([]);
    expect(read(parseDocument(html, url)).compose?.search.add).toBeTruthy();
  });
});
