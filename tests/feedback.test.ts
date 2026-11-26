// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument, serializeForm } from '@/lib/lectio/client';
import { appRoute } from '@/lib/lectio/paths';
import { readFeedback } from '@/lib/lectio/readers/feedback.js';
import { cleanStyle, fileLinkHtml, isBlank, tableHtml, toEditorHtml, toLectioHtml } from '@/features/lesson/feedback-html';
import { feedbackPage } from '../scripts/feedback-fixture.mjs';

const URL_ = 'https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=5001&lectab=elevindhold';
const load = (opts: Parameters<typeof feedbackPage>[1] = {}) => parseDocument(feedbackPage('/lectio/123/', opts), URL_);

describe('readFeedback', () => {
  it('reads an open elevfeedback page with the own editor', () => {
    const data = readFeedback(load());
    expect(data.open).toBe(true);
    expect(data.canWrite).toBe(true);
    expect(data.own.name).toBe('Demo Elev');
    expect(data.own.editor.html).toContain('<h1 id="2001">Mine rammer</h1>');
    expect(data.own.editor.target).toBe('s$m$Content$Content$Elevindhold$tocAndToolbar$elevindholdEditLV$ctrl4$HomeworkEditLV$ctrl0$editor');
    expect(data.own.editor.dirtyName).toBe(`${data.own.editor.target}$isDirty`);
    // Clara has written nothing: no paper, but she is on the roster.
    expect(data.others.map((p: any) => p.name)).toEqual(['Alma Holm', 'Bertram Juul']);
    expect(data.roster.map((r: any) => r.name)).toEqual(['Lærer', 'Alma Holm', 'Bertram Juul', 'Clara Winther', 'Demo Elev']);
    expect(data.roster.find((r: any) => r.name === 'Clara Winther').entries).toHaveLength(0);
    expect(data.lesson.holds).toEqual(['3a Da']);
    expect(data.contentHref).toMatch(/lectab=lektier$/);
    expect(data.hint).toMatch(/^Her kan elever/);
  });

  it('reads a module where elevfeedback is not open', () => {
    const data = readFeedback(load({ open: false }));
    expect(data.open).toBe(false);
    expect(data.canWrite).toBe(false);
    expect(data.others).toHaveLength(0);
  });

  it('reads a read-only module', () => {
    const data = readFeedback(load({ canWrite: false }));
    expect(data.open).toBe(true);
    expect(data.canWrite).toBe(false);
    expect(data.own).toBeNull();
    expect(data.others.map((p: any) => p.name)).toContain('Demo Elev');
  });

  it('posts the editor content back in the form', () => {
    const doc = load();
    const data = readFeedback(doc);
    const form = doc.querySelector('form') as HTMLFormElement;
    const fields = new Map(serializeForm(form));
    expect(fields.get(data.own.editor.textarea.getAttribute('name'))).toContain('Mine rammer');
    expect(fields.has(data.own.editor.dirtyName)).toBe(true);
  });

  it('rejects unrelated pages', () => {
    expect(() => readFeedback(parseDocument('<form id="aspnetForm"><a href="logout.aspx">Log ud</a></form>', URL_))).toThrow();
  });
});

describe('elevfeedback HTML', () => {
  it('makes resource URLs absolute for the editor and relative again for Lectio', () => {
    const stored = '<p><img alt="" height="10" src="/lectio/123/lc/1/res/2/billede.png" width="20" /></p><p><a href="/lectio/123/lc/ext/DT1/a.docx" data-lc-display-linktype="file">a.docx</a></p>';
    const editor = toEditorHtml(stored);
    expect(editor).toContain('src="https://www.lectio.dk/lectio/123/lc/1/res/2/billede.png"');
    expect(editor).toContain('href="https://www.lectio.dk/lectio/123/lc/ext/DT1/a.docx"');
    const back = toLectioHtml(editor);
    expect(back).toContain('src="/lectio/123/lc/1/res/2/billede.png"');
    expect(back).toContain('width="20"');
    expect(back).toContain('data-lc-display-linktype="file"');
  });

  it('normalises browser editing markup to what CKEditor produces', () => {
    const html = '<div>Hej <b>fed</b> <i>kursiv</i> <strike>væk</strike> <font color="#ff0000">rød</font></div><div><br></div>';
    expect(toLectioHtml(html)).toBe('<p>Hej <strong>fed</strong> <em>kursiv</em> <s>væk</s> <span style="color: #ff0000">rød</span></p>');
  });

  it('keeps alignment, indent and colours but drops everything unsafe', () => {
    const html = '<p style="text-align: center; font-family: Comic Sans; margin-left: 40px">x</p><script>alert(1)</script><p onclick="x()"><span style="background-color: rgb(241, 196, 15); position: fixed">y</span><img src="javascript:alert(1)"></p>';
    expect(toLectioHtml(html)).toBe('<p style="text-align: center; margin-left: 40px">x</p><p><span style="background-color: rgb(241, 196, 15)">y</span></p>');
    expect(cleanStyle('text-align: center', 'SPAN')).toBe('');
  });

  it('wraps loose inline content and unwraps layout divs', () => {
    expect(toLectioHtml('tekst <em>her</em><div><p>a</p></div><ul><li><div>b</div></li></ul>')).toBe('<p>tekst <em>her</em></p><p>a</p><ul><li>b</li></ul>');
  });

  it('builds tables and file links', () => {
    expect(tableHtml(1, 2)).toContain('<tr><td>&nbsp;</td><td>&nbsp;</td></tr>');
    expect(fileLinkHtml('/lectio/1/lc/ext/DT2/x "y".pdf', 'x "y".pdf')).toBe('<a href="https://www.lectio.dk/lectio/1/lc/ext/DT2/x &quot;y&quot;.pdf" data-lc-display-linktype="file">x &quot;y&quot;.pdf</a>&nbsp;');
  });

  it('detects blank documents', () => {
    expect(isBlank('<p><br></p><p>&nbsp;</p>')).toBe(true);
    expect(isBlank('<p><img src="/x.png"></p>')).toBe(false);
  });
});

describe('routes', () => {
  it('maps the elevfeedback tab into the app', () => {
    expect(appRoute('https://www.lectio.dk/lectio/1/aktivitet/aktivitetforside2.aspx?absid=42&lectab=elevindhold')).toBe('/lesson/42/feedback');
    expect(appRoute('https://www.lectio.dk/lectio/1/aktivitet/aktivitetforside2.aspx?absid=42&lectab=lektier')).toBe('/lesson/42');
    expect(appRoute('https://www.lectio.dk/lectio/1/aktivitet/aktivitetforside2.aspx?absid=42')).toBe('/lesson/42');
  });
});
