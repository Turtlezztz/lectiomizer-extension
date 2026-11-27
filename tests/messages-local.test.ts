import { describe, expect, it } from 'vitest';
import {
  DRAFT_MAX_AGE, addTemplate, canPin, composeDraftId, insertTemplate, isEmptyDraft, pinnedFirst, putDraft, removeTemplate, replyDraftId, threadIdFromUrl, threadText, togglePin,
} from '@/features/messages/local';
import { rowMatches } from '@/features/messages/model';
import type { MessageRow } from '@/features/messages/types';

describe('message drafts', () => {
  it('keys new messages by recipient and replies by thread', () => {
    expect(composeDraftId(null)).toBe('new:');
    expect(composeDraftId('S123')).toBe('new:S123');
    expect(replyDraftId('abc')).toBe('reply:abc');
  });

  it('stores, replaces and removes drafts', () => {
    const now = 1_000_000_000;
    let all = putDraft({}, 'new:', { subject: 'Hej', body: '' }, now);
    expect(all['new:']).toEqual({ subject: 'Hej', body: '', at: now });
    all = putDraft(all, 'reply:1', { body: 'Svar' }, now + 1);
    expect(Object.keys(all).sort()).toEqual(['new:', 'reply:1']);
    all = putDraft(all, 'reply:1', { body: '   ' }, now + 2);
    expect(all['reply:1']).toBeUndefined();
    all = putDraft(all, 'new:', null, now + 3);
    expect(all).toEqual({});
  });

  it('drops drafts older than a month', () => {
    const old = { 'reply:old': { body: 'gammel', at: 0 } };
    expect(putDraft(old, 'reply:new', { body: 'ny' }, DRAFT_MAX_AGE + 1)).toEqual({ 'reply:new': { body: 'ny', at: DRAFT_MAX_AGE + 1 } });
  });

  it('knows an empty draft', () => {
    expect(isEmptyDraft(null)).toBe(true);
    expect(isEmptyDraft({ body: ' \n', subject: ' ' })).toBe(true);
    expect(isEmptyDraft({ body: '', subject: 'Emne' })).toBe(false);
  });
});

describe('message templates', () => {
  it('adds newest first and replaces a template with the same name', () => {
    let list = addTemplate([], 'Syg', 'Jeg er syg i dag.', 'a');
    list = addTemplate(list, 'Tak', 'Tak for hjælpen!', 'b');
    list = addTemplate(list, ' syg ', 'Jeg er desværre syg.', 'c');
    expect(list.map((t) => [t.id, t.name])).toEqual([
      ['c', 'syg'],
      ['b', 'Tak'],
    ]);
    expect(removeTemplate(list, 'c').map((t) => t.id)).toEqual(['b']);
  });

  it('ignores a template without name or text', () => {
    expect(addTemplate([], '  ', 'tekst')).toEqual([]);
    expect(addTemplate([], 'Navn', '  ')).toEqual([]);
  });

  it('replaces an empty text and otherwise inserts at the cursor on its own lines', () => {
    expect(insertTemplate('', 'Hej')).toEqual({ text: 'Hej', cursor: 3 });
    expect(insertTemplate('Kære Lene', 'Hilsen')).toEqual({ text: 'Kære Lene\n\nHilsen', cursor: 17 });
    expect(insertTemplate('AB', 'x', 1)).toEqual({ text: 'A\n\nx\n\nB', cursor: 4 });
    expect(insertTemplate('A\n', 'x').text).toBe('A\nx');
  });
});

describe('pinned threads', () => {
  it('toggles pins, newest first', () => {
    expect(togglePin(['a'], 'b')).toEqual(['b', 'a']);
    expect(togglePin(['b', 'a'], 'b')).toEqual(['a']);
  });

  it('only pins real thread ids', () => {
    expect(canPin('123456')).toBe(true);
    expect(canPin('row3')).toBe(false);
    expect(canPin('new')).toBe(false);
  });

  it('puts pinned rows first in pin order', () => {
    const rows = ['1', '2', '3', '4'].map((id) => ({ id }));
    const { pinned, rest } = pinnedFirst(rows, ['3', '9', '1']);
    expect(pinned.map((r) => r.id)).toEqual(['3', '1']);
    expect(rest.map((r) => r.id)).toEqual(['2', '4']);
  });
});

describe('searching cached threads', () => {
  it('finds the thread id of a cached thread page', () => {
    expect(threadIdFromUrl('https://www.lectio.dk/lectio/123/beskeder2.aspx?type=showthread&id=987')).toBe('987');
    expect(threadIdFromUrl('https://www.lectio.dk/lectio/123/beskeder2.aspx?mappeid=-70')).toBeNull();
  });

  it('matches a row by the text of its cached messages', () => {
    const row = { subject: 'Fravær', sender: 'Lene Madsen (lm)', starter: '', recipients: '', recipientsTitle: '' } as MessageRow;
    const content = { textContent: 'Husk at medbringe lommeregner' } as Element;
    const text = threadText({
      subject: 'Fravær',
      messages: [{ sender: { id: 'T1', full: 'Lene Madsen (lm)', name: 'Lene Madsen' }, title: '', content } as never],
    });
    expect(rowMatches(row, 'lommeregner')).toBe(false);
    expect(rowMatches(row, 'lommeregner', text)).toBe(true);
    expect(rowMatches(row, 'lene fravaer')).toBe(true);
  });
});
