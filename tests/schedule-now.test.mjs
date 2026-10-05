import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {schedule} from '../demo/fixtures.mjs';
import {schedulePage} from '../demo/schedule-fixture.mjs';
import {markNow,clearNow,scheduleScale} from '../src/schedule-now.js';

const page=html=>new JSDOM(`<div id="contenttable">${html}</div>`).window.document;
const lines=doc=>Array.from(doc.querySelectorAll('.lx-now-line'));
const top=el=>parseFloat(el.style.top);
const minutes=(h,m)=>h*60+m;

test('the time column\'s modules give the schedule its scale',()=>{
 const scale=scheduleScale(page(schedule()).querySelector('table.s2skema'));
 // Demo modules start at .91em (08:15), 5.09em (09:20) and 24.73em (14:30).
 assert.ok(Math.abs(scale(minutes(8,15))-.91)<.15);
 assert.ok(Math.abs(scale(minutes(9,20))-5.09)<.15);
 assert.ok(Math.abs(scale(minutes(14,30))-24.73)<.15);
});

test('now is a line through today\'s column and the time in the time column',()=>{
 const doc=page(schedule());
 markNow(doc,new Date(2026,9,7,10,0));
 const all=lines(doc);
 assert.equal(all.length,5);
 const today=doc.querySelector('.lx-now-today');
 assert.equal(today.closest('td').cellIndex,3);
 assert.ok(top(today)>5.09&&top(today)<9.55);
 assert.ok(all.every(line=>line.style.top===today.style.top&&line.getAttribute('aria-hidden')==='true'));
 const label=doc.querySelector('.lx-now-time');
 assert.equal(label.closest('td').cellIndex,0);
 assert.equal(label.textContent,'10:00');

 // Later the same markers move down; nothing is added.
 markNow(doc,new Date(2026,9,7,13,0));
 assert.deepEqual([lines(doc).length,doc.querySelectorAll('.lx-now-time').length],[5,1]);
 assert.equal(doc.querySelector('.lx-now-today'),today);
 assert.ok(top(today)>15.82&&top(today)<20.27);
 assert.equal(label.textContent,'13:00');

 clearNow(doc);
 assert.equal(doc.querySelectorAll('.lx-now-line,.lx-now-time').length,0);
});

test('no line on days and times the week does not show',()=>{
 const doc=page(schedule());
 markNow(doc,new Date(2026,9,10,10,0)); // Saturday
 assert.equal(lines(doc).length,0);
 markNow(doc,new Date(2026,9,7,10,0));
 markNow(doc,new Date(2026,9,7,4,0)); // before the first module
 assert.equal(doc.querySelectorAll('.lx-now-line,.lx-now-time').length,0);
 markNow(doc,new Date(2026,9,7,23,30)); // after the day's last em
 assert.equal(lines(doc).length,0);
});

test('lesson tooltips give the scale and keep another year\'s week unmarked',()=>{
 // 90-minute lessons drawn 3.82em tall, so 10:00 is 105 minutes below 08:15.
 const k=3.82/90;
 const lessons=[
  [0,1,0,'s2normal',['5/10-2026 08:15 til 09:45','Hold: 3a Da'],'3a Da','lm','A12',''],
  [0,2,105*k,'s2normal',['5/10-2026 10:00 til 11:30','Hold: 3a Ma'],'3a Ma','tn','B21',''],
 ];
 const doc=page(schedulePage(lessons,{duplicate:false}));
 markNow(doc,new Date(2026,9,5,9,0));
 const today=doc.querySelector('.lx-now-today');
 assert.equal(today.closest('td').cellIndex,1);
 assert.ok(Math.abs(top(today)-45*k)<.01);
 // The fixture has no time column, so there is no label.
 assert.equal(doc.querySelector('.lx-now-time'),null);

 // 5/10 in 2025 is the same day and month in week 40.
 markNow(doc,new Date(2025,9,5,9,0));
 assert.equal(lines(doc).length,0);
});
