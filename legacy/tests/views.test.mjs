import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {activityPage,assignmentsPage,assignmentPage,absencePage,messagesPage,homePage} from '../demo/views-fixtures.mjs';
import {readHome,parseLessonTime,parseAssignmentTitle} from '../src/readers/home.js';
import {readActivity} from '../src/readers/activity.js';
import {readAssignments,absencePercent} from '../src/readers/assignments.js';
import {readAssignment} from '../src/readers/assignment.js';
import {readAbsence} from '../src/readers/absence.js';
import {readMessages} from '../src/readers/messages.js';
import {personName,parseStamp} from '../src/readers/thread.js';
import {searchDirectory,fold} from '../src/views/recipients.js';
import {recipientRow} from '../demo/views-fixtures.mjs';
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
 assert.deepEqual(data.assignments.map(a=>a.absencePercent),[null,null,100,0]);
 assert.deepEqual([absencePercent('12,5 %'),absencePercent('Fravær: 0%'),absencePercent('')],[12.5,0,null]);
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

test('assignment group reads members, who the student is and the native add and remove controls',()=>{
 const {group}=readAssignment(page(assignmentPage(),'https://www.lectio.dk/lectio/123/ElevAflevering.aspx?elevid=1&exerciseid=1'));
 assert.deepEqual(group.members.map(m=>[m.id,m.name,m.className,m.me,!!m.remove]),[['S1','Demo Elev','3a 12',true,false],['S2','Anna Andersen','3a 01',false,true]]);
 assert.match(group.members[1].remove.getAttribute('onclick'),/DEL\$1/);
 assert.deepEqual(group.add.options.map(o=>[o.value,o.label]),[['3','Bjørn Lund (3a 05)'],['4','Helene Ravn (3a 02)'],['5','José Holm (3b 04)']]);
 assert.equal(group.add.select.id,'m_Content_groupStudentAddDD');assert.equal(group.add.button.id,'m_Content_groupStudentAddBtn');
 // Without elevid in the address, the student is the one "Afleveres af" lists.
 assert.deepEqual(readAssignment(page(assignmentPage({group:'alone'}))).group.members.map(m=>[m.name,m.me]),[['Demo Elev',true]]);
 assert.equal(readAssignment(page(assignmentPage({closed:true}))).group.add,null);
 assert.equal(readAssignment(page(assignmentPage({group:'none'}))).group,null);
});

test('absence reads totals and treats Lectio placeholders as missing causes',()=>{
 const data=readAbsence(page(absencePage()));
 assert.deepEqual(data.totals,[{value:'6,9%',label:'Almindeligt fravær'},{value:'1,1%',label:'Skriftligt fravær'}]);
 assert.deepEqual(data.history.rows.map(r=>[r.cause,r.comment,r.registered,r.registeredBy]),[['','','5/10-2026','lm'],['Sygdom','Var hos lægen','1/10-2026','tn']]);
 assert.equal(data.missing.rows[1].remark,'Kom for sent');assert.match(data.missing.rows[0].edit,/fravaer_aarsag\.aspx/);
 assert.equal(readAbsence(page(absencePage({missing:[]}))).missing.empty,'Ingen manglende fraværsårsager');
});

test('messages read folders, the current folder and thread rows',()=>{
 const data=readMessages(page(messagesPage(),'https://www.lectio.dk/lectio/123/beskeder2.aspx?mappeid=-70'));
 assert.deepEqual(data.folders.map(f=>[f.label,!!f.toggle,f.current]).slice(1,3),[['Alle med flag',false,false],['Nyeste',false,true]]);
 assert.equal(data.folders.at(-1).toggle?.tagName,'IMG');
 assert.deepEqual(data.messages.map(m=>[m.subject,m.unread,m.attachment]),[['Ekskursion fredag',true,true],['Opgavevejledning i matematik',false,false],['Introfest – information',true,false]]);
 assert.equal(data.messages[1].sender,'Thomas Nielsen (tn)');assert.equal(data.bulkOptions.length,5);
 assert.equal(data.thread,undefined);
});

// The signed-in student as Lectio's header shows them: photo with user id, title with student id.
const header=(user='100004')=>`<img id="s_m_HeaderContent_picctrlthumbimage" src="/lectio/123/GetImage.aspx?pictureid=7" onclick="ThumbViewer.Show(event, this,'/lectio/123/fotoupload.aspx?&usrid=${user}&prevurl=x', false);"><div id="s_m_HeaderContent_MainTitle" data-lectioContextCard="S900"><span>Eleven Demo Elev, 3a - </span>Beskeder</div>`;
const threadUrl='https://www.lectio.dk/lectio/123/beskeder2.aspx?mappeid=-70';

test('an open thread reads its people, messages, own messages and Lectio\'s reply form',()=>{
 const data=readMessages(page(header()+messagesPage({thread:true}),threadUrl));
 const {thread}=data;
 assert.equal(data.folders.find(f=>f.current).label,'Nyeste');
 assert.equal(thread.subject,'Ekskursion fredag');
 assert.equal(thread.base,'https://www.lectio.dk/lectio/123/');
 assert.equal(thread.back,threadUrl);
 assert.deepEqual(thread.me,{ids:['U100004','S900'],name:'Demo Elev',photo:'https://www.lectio.dk/lectio/123/GetImage.aspx?pictureid=7&fullsize=1'});
 assert.deepEqual(thread.recipients.map(r=>[r.id,r.name,r.own]),[['U100001','Lene Madsen',false],['U100002','Anna Andersen',false],['U100003','Mikkel Holm',false],['U100004','Demo Elev',true]]);
 assert.deepEqual(thread.messages.map(m=>[m.sender.name,m.own]),[['Lene Madsen',false],['Lene Madsen',false],['Anna Andersen',false],['Demo Elev',true],['Demo Elev',true],['Lene Madsen',false],['Mikkel Holm',false]]);
 const [first,,,mine]=thread.messages;
 assert.equal(first.sender.full,'Lene Madsen (lm)');assert.ok(first.date instanceof Date);assert.match(first.stamp,/^\d{2}-\d{2}-\d{4} 09:12:00$/);
 // Template whitespace goes; Lectio's line breaks and the text stay; the attachment moves out of the text.
 assert.equal(first.content.innerHTML,'Hej alle<br>\n<br>\nPå fredag tager vi til Experimentarium. Vi mødes ved hovedindgangen kl. 8.30.<br>\nHusk madpakke og buskort.');
 assert.deepEqual(first.attachments,[{name:'Program.pdf',href:'https://www.lectio.dk/lectio/123/dokumenthent.aspx?documentid=1&doctype=messagedoc',size:'84 KB'}]);
 assert.deepEqual(first.actions.map(a=>a.label),['Send ny besked til afsender']);
 assert.deepEqual(mine.actions.map(a=>[a.label,a.icon]),[['Rediger','edit'],['Send ny besked til afsender','reply']]);
 assert.equal(thread.messages.at(-1).title,'Fravær fredag');
 assert.ok(thread.reply.body.matches('textarea')&&thread.reply.send.id.endsWith('SendMessageBtn')&&thread.reply.attach.id.endsWith('choosedocBtn'));
 assert.equal(thread.reply.title.value,'Re: Ekskursion fredag');assert.deepEqual(thread.reply.files,[]);
 assert.ok(thread.actions.reply.id.endsWith('ReplyThreadBtn')&&thread.actions.flag.id.endsWith('FlagThreadHeaderOutsideBtn'));
 assert.equal(thread.actions.flagged,false);
 assert.deepEqual(thread.actions.menu.map(m=>m.label),['Rediger tråd','Ny tråd med samme modtagere','Flag besked','Marker som slettet']);
});

test('own messages are found by name when the header has no user id, and plain text keeps its lines',()=>{
 const doc=page(messagesPage({thread:true}),threadUrl);
 doc.title='Eleven Demo Elev, 3a - Beskeder - Lectio';
 const content=doc.querySelectorAll('.message-thread-message-content')[2];
 content.textContent='\n      Første linje\n  Anden linje\n\n    ';
 const {thread}=readMessages(doc);
 assert.deepEqual(thread.me.ids,[]);assert.equal(thread.me.photo,null);
 assert.deepEqual(thread.messages.filter(m=>m.own).map(m=>m.sender.id),['U100004','U100004']);
 assert.equal(thread.messages[2].content.innerHTML,'Første linje<br>Anden linje');
 assert.deepEqual([personName('Jonathan Hansen(k) (1x 17)'),personName('Lene Madsen (lm)'),personName('Elevrådet')],['Jonathan Hansen','Lene Madsen','Elevrådet']);
 assert.deepEqual(parseStamp('05-03-2026 14:33:09'),new Date(2026,2,5,14,33,9));
});

test('a thread being edited, a new thread and an unknown panel stay on Lectio\'s page',()=>{
 const editing=page(header()+messagesPage({thread:true}),threadUrl);
 editing.querySelector('.message-thread-message-content').innerHTML='<textarea></textarea>';
 assert.throws(()=>readMessages(editing),/redigeres/);
 const recipients=page(header()+messagesPage({thread:true}),threadUrl);
 recipients.querySelector('.thread-header-content').insertAdjacentHTML('beforeend','<input type="text" name="modtager">');
 assert.throws(()=>readMessages(recipients),/redigeres/);
 // Without sent messages the panel is a new message; without Lectio's recipient search it can't be read.
 const fresh=page(header()+messagesPage({thread:true}),threadUrl);
 for(const row of fresh.querySelectorAll('.message-thread-message-sender'))row.closest('tr').remove();
 assert.throws(()=>readMessages(fresh),/Modtagerfeltet/);
 assert.throws(()=>readMessages(page('<div id="s_m_Content_Content_ViewThreadPagePanel"><p>Hej</p></div>')),ReaderError);
});

test('a new message reads its recipients, Lectio\'s recipient search and lists, and the writing row',()=>{
 const doc=page(header()+messagesPage({compose:['T200001','H400001']}),threadUrl);
 const {compose,thread}=readMessages(doc);
 assert.equal(thread,undefined);
 assert.deepEqual(compose.recipients.map(r=>[r.id,r.full,r.name,!!r.remove]),[['','Lene Madsen (lm)','Lene Madsen',true],['','3a Da','3a Da',true]]);
 assert.ok(compose.search.input.id.endsWith('addRecipientDD_inp')&&compose.search.id.id.endsWith('addRecipientDD_inpid')&&compose.search.add.id.endsWith('AddRecipientBtn'));
 assert.deepEqual(compose.sources.map(s=>s.kind),['bcteacher','bcstudent','bchold','bcgroup']);
 assert.equal(compose.sources[0].url,'https://www.lectio.dk/lectio/123/cache/DropDown.aspx?type=bcteacher&afdeling=1&dt=1');
 assert.ok(compose.subject.id.endsWith('EditModeHeaderTitleTB_tb')&&compose.body.matches('textarea')&&compose.send.id.endsWith('SendMessageBtn')&&compose.cancel.id.endsWith('BackMessageBtn'));
 assert.deepEqual([compose.noReply.label,compose.noReply.input.checked],['Skal ikke kunne besvares',false]);
 assert.deepEqual(compose.errors,[]);assert.deepEqual(compose.me.ids,['U100004','S900']);assert.equal(compose.base,'https://www.lectio.dk/lectio/123/');
 // A recipient Lectio shows with a context card keeps it; validators that fired show their message.
 const carded=page(header()+messagesPage({compose:[]}),threadUrl);
 carded.querySelector('.noRecord').closest('tr').outerHTML=recipientRow('<span data-lectioContextCard="T200002">Thomas Nielsen (tn)</span>',0);
 // The subject's length validator is left out (the field keeps the limit); others that show are kept, hidden ones aren't.
 carded.querySelector('[id$="EditModeHeaderTitleTB_lv"]').style.display='inline';
 carded.querySelector('[id$="EditModeHeaderTitleTB_av"]').insertAdjacentHTML('afterend','<span class="alert validator"><span class="alert" style="display:inline">Du skal skrive et emne</span></span><span class="alert validator" style="display:none"><span class="alert">Skjult besked</span></span>');
 carded.querySelector('[id="GridRowMessage"] .message-options').insertAdjacentHTML('beforeend','<table id="x_AttachmentsGV"><tr><td><a href="/lectio/123/LectioFileHandler.ashx?id=1">Plan.pdf</a></td><td><a href="#" onclick="javascript:__doPostBack(\'x$AttachmentsGV\',\'DEL$0\'); return false;">Fjern</a></td></tr></table>');
 const second=readMessages(carded).compose;
 assert.deepEqual(second.recipients.map(r=>[r.id,r.name]),[['T200002','Thomas Nielsen']]);
 assert.deepEqual(second.errors,['Du skal skrive et emne']);
 assert.deepEqual(second.files.map(f=>[f.name,f.href,!!f.remove]),[['Plan.pdf','https://www.lectio.dk/lectio/123/LectioFileHandler.ashx?id=1',true]]);
});

test('recipient search matches every word, ranks names that start with it first and skips chosen ones',()=>{
 const items=[['Lene Madsen (lm)','T1','Lærer'],['Helene Ravn (3a 02)','S2','Elev'],['Elevrådet','G3','Gruppe'],['José Lund (3b 04)','S4','Elev'],['Bjørn Lund (3a 05)','S5','Elev']].map(([title,key,kind])=>({title,key,kind,search:fold(title)}));
 assert.deepEqual(searchDirectory(items,'le').map(i=>i.key),['T1','G3','S2']);
 assert.deepEqual(searchDirectory(items,'lund 3a').map(i=>i.key),['S5']);
 assert.deepEqual(searchDirectory(items,'jose').map(i=>i.key),['S4']);
 assert.deepEqual(searchDirectory(items,'BJØRN').map(i=>i.key),['S5']);
 assert.deepEqual(searchDirectory(items,'le',i=>i.key==='T1').map(i=>i.key),['G3','S2']);
 assert.deepEqual(searchDirectory(items,'  '),[]);
});

test('home reads the schedule with times, the dashboard blocks and unknown islands',()=>{
 const now=new Date(2026,9,5,10,30);
 const data=readHome(page(homePage(now),'https://www.lectio.dk/lectio/123/forside.aspx'));
 assert.deepEqual(data.days.map(d=>[d.label,d.lessons.length]),[['Mandag 5/10',3],['Tirsdag 6/10',2]]);
 const first=data.days[0].lessons[0];
 assert.deepEqual([first.module,first.holds,first.teachers,first.room,first.date,first.homework],['1. modul',['3a Da'],['lm'],'A12','',true]);
 assert.deepEqual(first.time,{start:new Date(2026,9,5,10,0),end:new Date(2026,9,5,11,30)});
 assert.deepEqual([data.assignments.info,data.assignments.rows.length,data.assignments.rows[0].urgent],['3 næste',3,true]);
 assert.deepEqual(parseAssignmentTitle(data.assignments.rows[1].rowTitle),{hold:'3a Ma',title:'Opgavesæt 3'});
 assert.equal(data.homework.rows[0].detail,'3a Fy: - Læs side 40-52 i Fysik B og løs opgave 2.3');
 assert.deepEqual([data.messages.info,data.messages.rows[0].sender],['2 ulæste','Lene Madsen (lm)']);
 assert.deepEqual(data.notices.rows.map(r=>r.important),[true,false]);
 assert.equal(data.registrations.rows[0].due,null);
 assert.deepEqual(data.other.map(b=>[b.title,b.info]),[['Konsultationer',''],['Spørgeskemaer','1 ubesvaret, 2 frigivne']]);
 assert.equal(data.groups.length,4);assert.equal(data.scheduleHref,'https://www.lectio.dk/lectio/123/SkemaNy.aspx');
 assert.equal(parseLessonTime('nope'),null);
 assert.throws(()=>readHome(page('<div class="ls-dashboard"></div>')),ReaderError);
});
