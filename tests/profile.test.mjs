import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readProfile, readProfileHolds, personDetails } from '../src/readers/profile.js';
import { fullPhoto } from '../src/lectio.js';
const url = 'https://www.lectio.dk/lectio/123/contextcard/contextcard.aspx?lectiocontextcard=S1';
const doc = html => new JSDOM(html).window.document;

test('reads Lectio context-card title, nested fields, photo and safe shortcuts', () => {
  const result = readProfile(doc(`<span class="lcc-title" style="display:none">Elev - Anna Andersen</span><table><tr><td><img src="/lectio/123/GetImage.aspx?pictureid=1"></td><td><table><tr><td>Stamklasse:&nbsp;</td><td>3a</td></tr><tr><td>Hold:</td><td>3a Da, 3a En</td></tr></table></td></tr></table><ul><li><a href="/lectio/123/beskeder2.aspx?sendids=S1">Send besked</a></li><li><a href="javascript:alert(1)">Skema</a></li><li><a href="https://evil.example/SkemaNy.aspx">Skema</a></li><li><a href="/lectio/123/SkemaNy.aspx?elevid=1">Skema</a></li></ul><script>throw new Error()</script>`), url);
  assert.equal(result.name, 'Anna Andersen'); assert.equal(result.role, 'Elev');
  assert.equal(result.photo, 'https://www.lectio.dk/lectio/123/GetImage.aspx?pictureid=1&fullsize=1');
  assert.deepEqual(result.details, [{ label: 'Stamklasse', value: '3a' }, { label: 'Hold', value: '3a Da, 3a En' }]);
  assert.deepEqual(result.links.map(link => link.label), ['Send besked', 'Skema']);
});

test('missing or external photos stay absent, and classes are recognised without assuming numeric prefixes', () => {
  assert.equal(readProfile(doc('<span class="lcc-title">Elev - Demo Elev</span><img src="/lectio/img/defaultfoto_small.jpg">'), url).photo, null);
  assert.equal(readProfile(doc('<img src="https://evil.example/GetImage.aspx?pictureid=1">'), url).photo, null);
  assert.deepEqual(personDetails({ name:'Demo Elev', full:'Demo Elev (LGF2 02)' }), [{ label:'Klasse', value:'LGF2 02' }]);
});

test('the full hold list comes from schedule destinations, excluding lessons and groups', () => {
  const holds = readProfileHolds(doc(`<a href="/lectio/123/SkemaNy.aspx?holdid=1">3a Da</a><a href="/lectio/123/SkemaNy.aspx?type=holdelement&amp;holdelementid=2">3a En</a><a href="/lectio/123/SkemaNy.aspx?holdid=1">3a Da</a><a href="/lectio/123/SkemaNy.aspx?gruppeid=9">Alle elever</a><a href="/lectio/123/aktivitet/aktivitetforside2.aspx?absid=1">Dansk</a>`), url);
  assert.deepEqual(holds.map(hold => hold.name), ['3a Da', '3a En']);
});

test('photos ask Lectio for the full-size picture instead of the thumbnail',()=>{
 assert.equal(fullPhoto('https://www.lectio.dk/lectio/1/GetImage.aspx?pictureid=7&maxwidth=40&maxheight=50'),'https://www.lectio.dk/lectio/1/GetImage.aspx?pictureid=7&fullsize=1');
 assert.equal(fullPhoto('https://www.lectio.dk/lectio/1/img/defaultfoto.jpg'),'https://www.lectio.dk/lectio/1/img/defaultfoto.jpg');
 assert.equal(fullPhoto(null),null);
});
