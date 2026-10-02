import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {activityPage,assignmentsPage,assignmentPage,absencePage,messagesPage} from '../demo/views-fixtures.mjs';
import {readActivity} from '../src/readers/activity.js';
import {readAssignments} from '../src/readers/assignments.js';
import {readAssignment} from '../src/readers/assignment.js';
import {readAbsence} from '../src/readers/absence.js';
import {readMessages} from '../src/readers/messages.js';
import {ReaderError,readLesson,parseLectioDate} from '../src/readers/util.js';

const page=(html,url='https://www.lectio.dk/lectio/123/x.aspx')=>new JSDOM(`<div id="contenttable">${html}</div>`,{url}).window.document;

test('lesson links split into date, module, people, room and title',()=>{
 const lesson=readLesson(page(activityPage()).querySelector('[id$="actHeader"] a.s2skemabrik'));
 assert.deepEqual([lesson.date,lesson.module,lesson.holds,lesson.teachers,lesson.room,lesson.title,lesson.status],['fr 9/10','2. modul',['3a Da'],['lm'],'A12','Noveller','normal']);
 assert.deepEqual(parseLectioDate('23/8-2026 21:00:00'),new Date(2026,7,23,21,0));
});

test('activity content is grouped by section with navigation, note and extras',()=>{
 const data=readActivity(page(activityPage()));
 assert.deepEqual(data.sections.map(s=>[s.title,s.items.map(i=>i.title)]),[['Lektier',['Læs og forbered','Analysemodel']]]);
 assert.equal(data.note,'Husk computer og opladt telefon.');
 assert.deepEqual(data.print.map(p=>p.label),['Vis udskrift','Udskriv i A3-format','Udskriv i A4-format']);
 assert.deepEqual(data.extras.map(e=>[e.label,!!e.href]),[['Præsentation (ingen)',false],['Elevfeedback (ingen)',true]]);
 assert.equal(data.hold.label,'Holdets aktiviteter');assert.ok(data.previous.source&&data.next.source&&data.back.source);
 assert.deepEqual(data.phases.map(p=>p.label),['Noveller og analyse']);
 const empty=readActivity(page(activityPage({empty:true})));
 assert.deepEqual([empty.sections.length,empty.empty,empty.note],[0,'Der er ikke noget indhold.','']);
 assert.throws(()=>readActivity(page('<div>Elevfeedback</div>')),ReaderError);
});

test('assignments keep status, deadline and the native filters',()=>{
 const data=readAssignments(page(assignmentsPage()));
 assert.deepEqual(data.assignments.map(a=>a.statusKind),['waiting','waiting','missing','delivered']);
 assert.deepEqual(data.assignments[0].deadline,new Date(2026,9,9,23,59));
 assert.equal(data.assignments[0].studentTime,'4,00');assert.equal(data.assignments[3].awaiting,'Lærer');
 assert.deepEqual(data.filters.map(f=>[f.label,f.checked]),[['Vis kun aktuelle',true],['Vis kun for indeværende skoleår',true]]);
 assert.equal(readAssignments(page(assignmentsPage([]))).assignments.length,0);
});

test('assignment detail reads info, student status, entries and the hand-in form',()=>{
 const data=readAssignment(page(assignmentPage()));
 assert.equal(data.title,'Novelleanalyse');assert.equal(data.info.Ansvarlig.text,'Lene Madsen (lm)');
 assert.equal(data.info.Opgavebeskrivelse.links[0].label,'Novelleanalyse.docx (ma 5/10)');
 assert.deepEqual(data.students.map(s=>[s.name,s.awaiting,s.status,s.finished]),[['Demo Elev, 3a 12','Elev','Venter / Fravær: 0%',false]]);
 assert.deepEqual(data.entries.map(e=>[e.user,e.documents.length,!!e.time]),[['Demo Elev',1,true],['lm',0,true]]);
 assert.ok(data.handIn.comment&&data.handIn.send&&data.handIn.upload);
 assert.equal(readAssignment(page(assignmentPage({closed:true}))).handIn,null);
});

test('absence reads totals and treats Lectio placeholders as missing causes',()=>{
 const data=readAbsence(page(absencePage()));
 assert.deepEqual(data.totals,[{value:'6,9%',label:'Almindeligt fravær'},{value:'1,1%',label:'Skriftligt fravær'}]);
 assert.deepEqual(data.history.rows.map(r=>[r.cause,r.comment,r.registered,r.registeredBy]),[['','','5/10-2026','lm'],['Sygdom','Var hos lægen','1/10-2026','tn']]);
 assert.equal(data.missing.rows[1].remark,'Kom for sent');assert.match(data.missing.rows[0].edit,/fravaer_aarsag\.aspx/);
 assert.equal(readAbsence(page(absencePage({missing:[]}))).missing.empty,'Ingen manglende fraværsårsager');
});

test('messages read folders, the current folder and thread rows; an open thread is rejected',()=>{
 const data=readMessages(page(messagesPage(),'https://www.lectio.dk/lectio/123/beskeder2.aspx?mappeid=-70'));
 assert.deepEqual(data.folders.map(f=>[f.label,!!f.toggle,f.current]).slice(1,3),[['Alle med flag',false,false],['Nyeste',false,true]]);
 assert.equal(data.folders.at(-1).toggle?.tagName,'IMG');
 assert.deepEqual(data.messages.map(m=>[m.subject,m.unread,m.attachment]),[['Ekskursion fredag',true,true],['Opgavevejledning i matematik',false,false],['Introfest – information',true,false]]);
 assert.equal(data.messages[1].sender,'Thomas Nielsen (tn)');assert.equal(data.bulkOptions.length,5);
 assert.throws(()=>readMessages(page(messagesPage({thread:true}))),ReaderError);
});
