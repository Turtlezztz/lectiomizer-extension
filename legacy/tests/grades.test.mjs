import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {gradesPage, demoGrades} from '../demo/grades-fixture.mjs';
import {readGrades, parseGradeTitle, splitSubject} from '../src/readers/grades.js';
import {ReaderError} from '../src/readers/util.js';

const page=(html=gradesPage())=>new JSDOM(`<select id="s_m_ChooseTerm_term"><option>2026/27</option></select><div id="contenttable">${html}</div>`).window.document;

test('current grades are grouped by subject with desktop cells only',()=>{
 const data=readGrades(page());
 assert.equal(data.term,'2026/27');
 assert.deepEqual(data.current.types,['1.standpunkt','2.standpunkt','Afsluttende års-/standpunktskarakter','Intern prøve','Årskarakter','Eksamens-/årsprøvekarakter']);
 const danish=data.current.subjects.find(s=>s.subject==='Dansk A');
 assert.equal(danish.hold,'3a Da');
 assert.deepEqual(danish.forms.map(f=>f.form),['Skriftlig','Mundtlig']);
 assert.deepEqual(danish.forms[0].grades.map(g=>[g.type,g.value,g.final]),[['1.standpunkt','7',false],['2.standpunkt','10',false],['Årskarakter','10',true]]);
 assert.equal(data.current.subjects.length,new Set(demoGrades.map(([hold,fag])=>fag.split(',')[0]+hold)).size);
});

test('grade tooltips and extra lines are kept as data',()=>{
 const chemistry=readGrades(page()).current.subjects.find(s=>s.subject==='Kemi B').forms[0].grades.at(-1);
 assert.deepEqual([chemistry.value,chemistry.extra,chemistry.xprs,chemistry.source,chemistry.weight],['7',['vægt: 1,5'],'6729B Kemi','Protokol','0,75']);
 assert.deepEqual(parseGradeTitle('XPRSFag: 6689B Engelsk\nKilde: Protokol og Karakter\nVægt: 0,75'),{xprs:'6689B Engelsk',source:'Protokol og Karakter',weight:'0,75'});
 assert.deepEqual(splitSubject('Studieområdet og studieområdeprojektet, Mundtlig'),{subject:'Studieområdet og studieområdeprojektet',form:'Mundtlig'});
});

test('an empty school year reads as an empty state, not a failure',()=>{
 const data=readGrades(page(gradesPage({grades:[]})));
 assert.deepEqual(data.current,{types:[],subjects:[],empty:'Der er ingen data'});
 assert.equal(data.notices.length,1);
 assert.equal(data.notes.empty,'Der er ingen data');
 assert.deepEqual(data.remarks.columns,['Dato','Initialer','Type','Elevnote']);
 assert.equal(data.remarks.empty,'Ingen bemærkninger');
});

test('diploma lines keep year and exam groups, averages and missing results',()=>{
 const [diploma]=readGrades(page()).diplomas;
 assert.equal(diploma.title,'HTX v4');
 assert.deepEqual(diploma.groups,['Årskarakter','Eksamenskarakter']);
 const oral=diploma.lines.find(l=>l.subject==='Dansk A, mdt.');
 assert.deepEqual(oral.results[0],{label:'Årskarakter',fields:{'Vægt':'2,00',Karakter:'12',ECTS:'A'},empty:false});
 assert.equal(oral.results[1].empty,true);
 assert.deepEqual(diploma.averages,[{label:'Eksamensresultat ekskl. bonus',value:'8,4',note:'baseret på nuværende eksamenskarakterer'},{label:'Eksamensresultat inkl. evt. bonus',value:'8,6',note:'baseret på nuværende eksamenskarakterer'}]);
});

test('protocol lines are labelled by their headings without mobile duplicates',()=>{
 const {protocol}=readGrades(page());
 assert.deepEqual(protocol.columns,['Termin','Type','Medtæller','XPRS fag','Evalueringsform','Hold','Vægt','Karakter','Skala']);
 assert.equal(protocol.rows.length,3);
 assert.equal(protocol.rows[0]['XPRS fag'],'6688A Dansk');
});

test('a missing grade table fails loudly and a broken section fails alone',()=>{
 const doc=page();doc.querySelector('[id$="karakterView_KarakterGV"]').remove();
 assert.throws(()=>readGrades(doc),ReaderError);
 const partial=page();partial.querySelector('[id$="printareaDiplomaLines"] table').deleteRow(1);
 const data=readGrades(partial);
 assert.match(data.diplomas[0].error,/kolonnegrupper/);
 assert.ok(data.current.subjects.length);assert.equal(data.protocol.rows.length,3);
});
