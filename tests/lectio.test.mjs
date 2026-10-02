import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { navigationFromDOM, schoolBase, routeKey, pageKind } from '../src/lectio.js';

test('discovers school navigation while excluding remote and script actions', () => {
 const dom = new JSDOM(`<div id="s_m_HeaderContent_subnavigator_generic_tr"><a href="/lectio/681/SkemaNy.aspx">Skema</a><a href="/lectio/681/OpgaverElev.aspx">Opgaver</a><a href="javascript:__doPostBack('x','')">Action</a><a href="https://example.com">Remote</a></div><div id="s_m_mastermenu"><a href="/lectio/681/SkemaNy.aspx">Skema</a><a href="/lectio/681/default.aspx?menu=kontakt">Kontakt</a><a href="#">searchSøg</a><a href="/lectio/999/forside.aspx">Other school</a></div>`);
 const links = navigationFromDOM(dom.window.document, 'https://www.lectio.dk/lectio/681/forside.aspx');
 assert.deepEqual(links.map(l=>l.label), ['Skema', 'Opgaver', 'Kontakt']);
 assert.equal(links[0].source.tagName, 'A');
});

test('route matching ignores record ids but preserves main menu destinations', () => {
 assert.equal(routeKey('/lectio/681/SkemaNy.aspx?week=402026'), '/lectio/681/skemany.aspx');
 assert.notEqual(routeKey('/lectio/681/default.aspx'), routeKey('/lectio/681/default.aspx?menu=kontakt'));
});

test('student ids are never hardcoded and school roots are detected', () => {
 assert.equal(schoolBase('https://www.lectio.dk/lectio/123/grades/grade_report.aspx'), '/lectio/123/');
 assert.equal(schoolBase('https://www.lectio.dk/'), null);
 assert.equal(pageKind('https://www.lectio.dk/lectio/123/ElevAflevering.aspx?exerciseid=1'), 'assignments');
});
