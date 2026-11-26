// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { absidFromHref, absidOf, asAttachment, isActionable } from '@/features/lesson/lesson-utils';

const doc = (body: string, url = 'https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=42') => parseDocument(`<html><body>${body}</body></html>`, url);

describe('lesson utils', () => {
  it('finds the absid of a response', () => {
    expect(absidFromHref('https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=7')).toBe('7');
    expect(absidOf(doc(''))).toBe('42');
    expect(absidOf(doc('<form id="aspnetForm" action="./aktivitetforside2.aspx?absid=99"></form>', 'https://www.lectio.dk/lectio/123/aktivitet/x.aspx'))).toBe('99');
  });
  it('detects link-only items as attachments', () => {
    const d = doc('<article id="a"><h1><a href="/lectio/123/lc/1/res/2/Model.pdf">Model</a></h1></article><article id="b"><p>Læs <a href="/x.pdf">dette</a> først</p></article>');
    expect(asAttachment(d.getElementById('a')!)).toEqual({ label: 'Model', href: 'https://www.lectio.dk/lectio/123/lc/1/res/2/Model.pdf', ext: 'pdf' });
    expect(asAttachment(d.getElementById('b')!)).toBeNull();
  });
  it('knows which nav links can run outside Lectio', () => {
    const d = doc(`<a id="p" href="javascript:__doPostBack('s$prev','')">x</a><a id="n" href="#" onclick="return false;">y</a>`);
    const target = (el: Element) => (/__doPostBack/.test(el.getAttribute('href') || '') ? {} : null);
    expect(isActionable(d.getElementById('p'), target)).toBe(true);
    expect(isActionable(d.getElementById('n'), target)).toBe(false);
  });
});
