import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {fixture} from '../demo/fixtures.mjs';
import {readModel} from '../src/model.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const opened=new Set();
after(()=>{for(const dom of opened)dom.window.close();});
async function mount(path,before=()=>{},mobile=false){
 const dom=new JSDOM(fixture(path,false),{url:'https://www.lectio.dk'+path,runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});
 opened.add(dom);
 dom.window.scrollTo=()=>{};
 before(dom.window.document);
 dom.window.eval(await readFile('dist/content.js','utf8'));
 for(let i=0;i<30&&!dom.window.document.querySelector('.lx-topbar');i++)await delay(10);
 await delay(10);
 return dom;
}

test('sidebar keeps source navigation handlers, form values and all student sections',async()=>{
 const dom=await mount('/lectio/123/SkemaNy.aspx');const doc=dom.window.document;
 const source=doc.querySelector('#s_m_HeaderContent_subnavigator_generic_tr a[href$="OpgaverElev.aspx"]');
 let clicks=0,submits=0;source.addEventListener('click',e=>{e.preventDefault();clicks++;});doc.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submits++;});
 doc.querySelector('.lx-navigation a[href$="OpgaverElev.aspx"]').click();
 assert.equal(clicks,1);assert.equal(submits,0);
 assert.equal(doc.querySelector('input[name="__VIEWSTATE"]').value,'DEMO-HIDDEN-FIELD');
 assert.equal(doc.querySelectorAll('.lx-navigation a').length,13); // 12 daily/secondary destinations plus main menu; profile is in footer.
 assert.equal(doc.querySelector('.s2brik').dataset.lxResponsive,'true');
 assert.equal(doc.querySelector('.s2brik').style.top,'0.91em');
 const subjects=new Map();for(const brik of doc.querySelectorAll('.s2brik')){const name=brik.querySelector('.separator-value').textContent;assert.match(brik.dataset.lxSubject,/^[0-7]$/);assert.equal(subjects.get(name)??brik.dataset.lxSubject,brik.dataset.lxSubject);subjects.set(name,brik.dataset.lxSubject);}
 dom.window.dispatchEvent(new dom.window.Event('pagehide'));await delay(10);dom.window.close();
});

test('school-year selector triggers the original change listener',async()=>{
 const dom=await mount('/lectio/123/SkemaNy.aspx');const doc=dom.window.document;const source=doc.querySelector('#s_m_ChooseTerm_term');let changes=0;source.addEventListener('change',()=>changes++);
 const select=doc.querySelector('.lx-year-select');select.value='2025';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await delay(10);
 assert.equal(source.value,'2025');assert.equal(changes,1);dom.window.dispatchEvent(new dom.window.Event('pagehide'));await delay(10);dom.window.close();
});

test('disable restores table parents and reenable wraps the same native table',async()=>{
 const dom=await mount('/lectio/123/OpgaverElev.aspx');const doc=dom.window.document;const table=doc.querySelector('table.lf-grid');const parent=table.parentElement.parentElement;
 doc.querySelector('[aria-label="Lectiomizer indstillinger"]').click();await delay(10);
 Array.from(doc.querySelectorAll('button')).find(b=>b.textContent.includes('oprindelige design')).click();await delay(30);
 assert.equal(doc.body.classList.contains('lx-enabled'),false);assert.equal(table.parentElement,parent);assert.equal(doc.querySelector('.lx-table-scroll'),null);
 doc.querySelector('.lx-reenable').click();await delay(30);
 assert.equal(doc.body.classList.contains('lx-enabled'),true);assert.equal(doc.querySelector('table.lf-grid'),table);assert.ok(table.parentElement.classList.contains('lx-table-scroll'));dom.window.dispatchEvent(new dom.window.Event('pagehide'));await delay(10);dom.window.close();
});

test('all 13 student routes produce a model and remain in the same school',async()=>{
 const paths=['forside.aspx','SkemaNy.aspx','OpgaverElev.aspx','beskeder2.aspx','material_lektieoversigt.aspx','subnav/fravaerelev_fravaersaarsager.aspx','grades/grade_report.aspx','studieplan.aspx','DokumentOversigt.aspx','BD/UserReservations.aspx','spoergeskema/spoergeskema_rapport.aspx','Elev_SPS.aspx','indstillinger/studentIndstillinger.aspx'];
 for(const path of paths){const url='https://www.lectio.dk/lectio/123/'+path;const dom=new JSDOM(fixture('/lectio/123/'+path,false),{url});const model=readModel(dom.window.document,url);assert.equal(model.authenticated,true);assert.ok(model.nav.every(n=>n.href.startsWith('https://www.lectio.dk/lectio/123/')));assert.ok(model.title);dom.window.dispatchEvent(new dom.window.Event('pagehide'));await delay(10);dom.window.close();}
});

async function close(dom){dom.window.dispatchEvent(new dom.window.Event('pagehide'));await delay(10);dom.window.close();}
async function disable(dom){const doc=dom.window.document;doc.querySelector('[aria-label="Lectiomizer indstillinger"]').click();await delay(10);Array.from(doc.querySelectorAll('button')).find(b=>b.textContent.includes('oprindelige design')).click();await delay(30);}

test('study course focus keeps selected content and original filter values',async()=>{
 let table,filter;
 const dom=await mount('/lectio/123/studieplan.aspx',doc=>{table=doc.querySelector('.yeartable');filter=doc.querySelector('input[type=checkbox]');filter.checked=false;},true);const doc=dom.window.document;const picker=doc.querySelector('.lx-course-picker select');
 assert.equal(picker.value,'2');picker.value='3';picker.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await delay(20);
 assert.ok(table.rows[1].cells[2].classList.contains('lx-course-hidden'));assert.ok(!table.rows[1].cells[3].classList.contains('lx-course-hidden'));assert.ok(!table.rows[1].cells[0].classList.contains('lx-course-hidden'));
 await disable(dom);assert.equal(doc.querySelector('.yeartable'),table);assert.equal(filter.checked,false);assert.equal(table.querySelector('.lx-course-hidden'),null);await close(dom);
});

test('grades render as a rebuilt view while the native report stays in the form',async()=>{
 let native,parent;
 const dom=await mount('/lectio/123/grades/grade_report.aspx',doc=>{native=doc.querySelector('#printallarea');parent=native.parentNode;});const doc=dom.window.document;
 const content=doc.querySelector('#contenttable');const view=content.querySelector('.lx-view[data-lx-view="grades"]');
 assert.ok(view);assert.ok(content.classList.contains('lx-view-active'));assert.equal(native.parentNode,parent);
 assert.equal(content.querySelector('[data-lx-record-prepared]'),null);assert.equal(content.querySelector('.lx-page-intro'),null);
 assert.deepEqual(Array.from(view.querySelectorAll('.lx-subject-head strong')).slice(0,2).map(n=>n.textContent),['Dansk A','Engelsk B']);
 assert.deepEqual(Array.from(view.querySelectorAll('.lx-stat dd')).map(n=>n.textContent),['8,4','8,6']);
 assert.equal(view.querySelectorAll('.lx-grade-final').length,5);
 assert.equal(view.querySelectorAll('.lx-diploma-table tbody tr').length,5);
 Array.from(view.querySelectorAll('button')).find(b=>b.textContent.includes('Lectios visning')).click();await delay(20);
 assert.equal(content.classList.contains('lx-view-active'),false);assert.ok(view.querySelector('.lx-view-bar'));
 view.querySelector('.lx-view-bar button').click();await delay(20);assert.ok(content.classList.contains('lx-view-active'));
 await disable(dom);assert.equal(content.querySelector('.lx-view'),null);assert.equal(content.classList.contains('lx-view-active'),false);assert.equal(native.parentNode,parent);
 doc.querySelector('.lx-reenable').click();await delay(30);assert.ok(content.querySelector('.lx-view[data-lx-view="grades"]'));await close(dom);
});

test('grades fall back to the native page when the reader cannot understand it',async()=>{
 const dom=await mount('/lectio/123/grades/grade_report.aspx',doc=>doc.querySelector('[id$="karakterView_KarakterGV"]').id='renamedByLectio');const content=dom.window.document.querySelector('#contenttable');
 assert.equal(content.querySelector('.lx-view'),null);assert.equal(content.classList.contains('lx-view-active'),false);assert.ok(content.querySelector('#printallarea'));await close(dom);
});

test('grades view re-reads Lectio content after an UpdatePanel replacement',async()=>{
 const dom=await mount('/lectio/123/grades/grade_report.aspx');const doc=dom.window.document;const content=doc.querySelector('#contenttable');
 const fresh=new JSDOM(fixture('/lectio/123/grades/grade_report.aspx',false));const replacement=fresh.window.document.querySelector('#contenttable');
 replacement.querySelector('[id$="karakterView_KarakterGV"] tbody').replaceChildren(...JSDOM.fragment('<tr><td colspan="4"><div class="noRecord">Der er ingen data...</div></td></tr>').childNodes);
 content.replaceChildren(...Array.from(replacement.childNodes).map(n=>doc.importNode(n,true)));await delay(250);
 const view=content.querySelector('.lx-view[data-lx-view="grades"]');assert.ok(view);assert.ok(content.classList.contains('lx-view-active'));
 assert.equal(view.querySelectorAll('.lx-subject').length,0);assert.match(view.querySelector('.lx-empty-state').textContent,/ingen karakterer/);fresh.window.close();await close(dom);
});

test('new document UpdatePanel content receives the folder and record adapters',async()=>{
 const dom=await mount('/lectio/123/DokumentOversigt.aspx');const doc=dom.window.document;const fresh=new JSDOM(fixture('/lectio/123/DokumentOversigt.aspx',false));const content=doc.querySelector('#contenttable');content.replaceChildren(...Array.from(fresh.window.document.querySelector('#contenttable').childNodes).map(n=>doc.importNode(n,true)));await delay(250);
 assert.ok(content.querySelector('.lx-browser-workspace'));assert.ok(content.querySelector('.lx-page-intro'));assert.equal(content.querySelectorAll('.lx-record-row').length,2);fresh.window.close();await close(dom);
});

test('pages keep task adapters or render rebuilt views, and reports disclose secondary sections',async()=>{
 for(const [path,kind] of [['subnav/fravaerelev.aspx','absence'],['studieplan.aspx','study'],['DokumentOversigt.aspx','documents'],['BD/UserReservations.aspx','books']]){const dom=await mount('/lectio/123/'+path);assert.equal(dom.window.document.querySelector('#contenttable').dataset.lxWorkspace,kind,path);await close(dom);}
 for(const [path,kind] of [['forside.aspx','home'],['grades/grade_report.aspx','grades'],['aktivitet/aktivitetforside2.aspx','activity'],['OpgaverElev.aspx','assignments'],['ElevAflevering.aspx','assignment'],['subnav/fravaerelev_fravaersaarsager.aspx','absence'],['beskeder2.aspx','messages']]){const dom=await mount('/lectio/123/'+path);const doc=dom.window.document;assert.ok(doc.querySelector(`.lx-view[data-lx-view="${kind}"]`),path);assert.ok(doc.querySelector('#contenttable').classList.contains('lx-view-active'),path);assert.equal(doc.querySelector('#contenttable').dataset.lxWorkspace,undefined,path);await close(dom);}
});

test('activity renders the lesson, sanitised content and drives native navigation',async()=>{
 let next=0,print=0;
 const dom=await mount('/lectio/123/aktivitet/aktivitetforside2.aspx',doc=>{doc.querySelector('[id$="entityNavDiv"] a[title="Min næste aktivitet"]').addEventListener('click',e=>{e.preventDefault();next++;});doc.querySelector('.lec-context-menu a').addEventListener('click',e=>{e.preventDefault();print++;});});const doc=dom.window.document;const view=doc.querySelector('.lx-view[data-lx-view="activity"]');
 assert.match(view.querySelector('.lx-lesson-head h2').textContent,/Noveller/);assert.equal(view.querySelector('.lx-lesson-meta').textContent,'fr 9/10 · 2. modul · 3a Da · lm · A12');
 assert.equal(view.querySelector('.lx-callout p').textContent,'Husk computer og opladt telefon.');
 assert.equal(view.querySelectorAll('.lx-activity-item').length,2);assert.equal(view.querySelectorAll('.lx-toc li').length,2);
 assert.equal(view.querySelector('script'),null);assert.equal(dom.window.injected,undefined);assert.equal(view.querySelector('a[href^="javascript"]'),null);
 assert.equal(view.querySelector('.lx-rich a[href="https://example.org/tekst"]').target,'_blank');assert.ok(view.querySelector('.lx-rich a[href$="Analysemodel.pdf"]'));
 assert.ok(view.querySelector('.lx-rich h3'));assert.equal(view.querySelector('.lx-rich h1'),null);
 view.querySelector('[title="Min næste aktivitet"]').click();view.querySelector('[title="Vis udskrift"]').click();assert.equal(next,1);assert.equal(print,1);
 assert.deepEqual(Array.from(view.querySelectorAll('.lx-tab')).map(t=>t.textContent),['Indhold','Elevfeedback']);await close(dom);
});

test('assignments render grouped records while native filters stay in charge',async()=>{
 let filterClicks=0;
 const dom=await mount('/lectio/123/OpgaverElev.aspx',doc=>doc.querySelector('[id$="CurrentExerciseFilterCB"]').addEventListener('click',e=>{e.preventDefault();filterClicks++;}));const doc=dom.window.document;const view=doc.querySelector('.lx-view[data-lx-view="assignments"]');
 assert.deepEqual(Array.from(view.querySelectorAll('.lx-assignment-group h2')).map(h=>h.firstChild.textContent.trim()),['Kommende','Mangler','Afleveret']);
 assert.equal(view.querySelectorAll('.lx-assignment').length,4);assert.ok(view.querySelector('.lx-assignment-missing .lx-pill-alert'));
 assert.ok(view.querySelector('.lx-assignment a[href*="ElevAflevering.aspx"]'));assert.match(view.querySelector('.lx-assignment-delivered').textContent,/Afventer lærer/);
 view.querySelector('.lx-switch input').click();assert.equal(filterClicks,1);
 const search=view.querySelector('.lx-search-field input');const setValue=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;setValue.call(search,'essay');search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await delay(20);
 assert.equal(view.querySelectorAll('.lx-assignment').length,1);await close(dom);
});

test('assignment detail shows entries and hands in through the native form',async()=>{
 let sent=0,upload=0;
 const dom=await mount('/lectio/123/ElevAflevering.aspx',doc=>{doc.querySelector('#m_Content_AddEntryBtn').addEventListener('click',e=>{e.preventDefault();sent++;});doc.querySelector('#m_Content_choosedocument_choosedocBtn').addEventListener('click',e=>{e.preventDefault();upload++;});});const doc=dom.window.document;const view=doc.querySelector('.lx-view[data-lx-view="assignment"]');
 assert.equal(view.querySelector('.lx-assignment-head h2').textContent,'Novelleanalyse');assert.equal(view.querySelectorAll('.lx-timeline > li').length,2);
 assert.equal(view.querySelector('.lx-timeline-body').textContent,'God start!Uddyb analysen af synsvinkel.');assert.ok(view.querySelector('.lx-file[href*="exercisefileid"]'));
 assert.deepEqual(Array.from(view.querySelectorAll('.lx-assignment-side li')).map(li=>li.textContent),['Demo Elev, 3a 12','Anna Andersen, 3a 01']);
 const box=view.querySelector('#lx-hand-in-comment');const setValue=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;setValue.call(box,'Her er min aflevering');box.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await delay(20);
 assert.equal(doc.querySelector('#m_Content_CommentsTB_tb').value,'Her er min aflevering');
 Array.from(view.querySelectorAll('button')).find(b=>b.textContent.includes('Send kun kommentar')).click();Array.from(view.querySelectorAll('button')).find(b=>b.textContent.includes('Vælg dokument')).click();
 assert.equal(sent,1);assert.equal(upload,1);await close(dom);
});

test('absence shows totals, lessons missing a cause and the registration history',async()=>{
 const dom=await mount('/lectio/123/subnav/fravaerelev_fravaersaarsager.aspx');const view=dom.window.document.querySelector('.lx-view[data-lx-view="absence"]');
 assert.deepEqual(Array.from(view.querySelectorAll('.lx-stat dd')).map(d=>d.textContent),['6,9%','1,1%']);
 assert.equal(view.querySelectorAll('section .lx-absence-row').length,2);assert.ok(view.querySelector('section .lx-absence-row a.lx-chip-button[href*="fravaer_aarsag.aspx"]'));
 const history=view.querySelector('details.lx-view-disclosure');assert.equal(history.open,false);
 assert.deepEqual(Array.from(history.querySelectorAll('.lx-absence-cause')).map(c=>c.firstChild.textContent),['Ingen årsag','Sygdom']);await close(dom);
});

test('messages render a compact list and act through native controls',async()=>{
 let opened=0,folder=0,changes=0;
 const dom=await mount('/lectio/123/beskeder2.aspx?mappeid=-70',doc=>{doc.querySelector('a[id$="threadGV_ctl02_ch"]').addEventListener('click',e=>{e.preventDefault();opened++;});doc.querySelector('[lec-node-id="-40"] a.TreeNode').addEventListener('click',e=>{e.preventDefault();folder++;});doc.querySelector('[id$="MarkChkDD"]').addEventListener('change',()=>changes++);});const doc=dom.window.document;const view=doc.querySelector('.lx-view[data-lx-view="messages"]');
 assert.equal(view.querySelectorAll('.lx-message').length,3);assert.equal(view.querySelectorAll('.lx-message.lx-unread').length,2);assert.equal(view.querySelector('.lx-folder-current').textContent,'Nyeste');
 assert.ok(view.querySelector('.lx-message svg[aria-label="Vedhæftet fil"]'));
 view.querySelector('.lx-message-subject').click();assert.equal(opened,1);view.querySelector('.lx-folder .lx-folder-link').click();assert.equal(folder,1);
 view.querySelector('.lx-message input[type=checkbox]').click();await delay(20);assert.equal(doc.querySelector('[id$="threadGV_ctl02_threadCB"]').checked,true);
 const bulk=view.querySelector('select.lx-select');bulk.value='read';bulk.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await delay(20);
 assert.equal(doc.querySelector('[id$="MarkChkDD"]').value,'read');assert.equal(changes,1);await close(dom);
});

test('an open message thread keeps the restyled native page',async()=>{
 const dom=await mount('/lectio/123/beskeder2.aspx',doc=>{doc.querySelector('.lectiofilepicker-foldercontent-col').innerHTML='<div id="s_m_Content_Content_ViewThreadPagePanel"><p>Hej</p></div>';});const doc=dom.window.document;
 assert.equal(doc.querySelector('.lx-view'),null);assert.ok(doc.querySelector('.lx-browser-workspace'));await close(dom);
});

test('home leads with the running lesson, ranks what needs you and keeps today beside it',async()=>{
 const dom=await mount('/lectio/123/forside.aspx');const doc=dom.window.document;const view=doc.querySelector('.lx-view[data-lx-view="home"]');
 assert.ok(view.previousSibling?.nodeType===8&&/THESIS:/.test(view.previousSibling.data));
 const now=view.querySelector('.lx-now');assert.equal(now.querySelector('h2').textContent,'3a Da');assert.equal(now.querySelector('.lx-now-state').textContent,'Nu');assert.ok(now.querySelector('[role="progressbar"]'));
 assert.match(now.querySelector('.lx-now-meta').textContent,/lm · lokale A12/);
 const groups=Array.from(view.querySelectorAll('.lx-needs-group h3')).map(h=>h.firstChild.textContent.trim());
 assert.deepEqual(groups,['Kræver handling','I dag','I morgen','Inden for en uge','Senere']);
 assert.equal(view.querySelector('.lx-needs-group:nth-of-type(1) .lx-need-main a').textContent,'Manglende fraværsårsager');
 assert.ok(view.querySelector('.lx-need-urgent a[href*="exerciseid=1"]'));
 assert.equal(view.querySelectorAll('.lx-need').length,6);
 assert.match(view.querySelector('.lx-need-main a[href*="absid=11"]').textContent,/^Læs side 40-52 i Fysik B og løs opgave 2\.3$/);
 assert.equal(view.querySelector('.lx-home-messages .lx-pill').textContent,'2 ulæste');assert.equal(view.querySelectorAll('.lx-home-list li').length,3);
 assert.equal(view.querySelector('.lx-notice-important .lx-pill').textContent,'Vigtigt');assert.equal(view.querySelector('.lx-notices a[href="https://example.org/aabent-hus"]').target,'_blank');
 assert.deepEqual(Array.from(view.querySelectorAll('.lx-other-block h3')).map(h=>h.textContent),['Konsultationer','Spørgeskemaer']);
 const side=view.querySelector('.lx-home-side');assert.equal(side.querySelectorAll('.lx-day-row').length,5);assert.equal(side.querySelectorAll('.lx-day-past').length,0);assert.equal(side.querySelectorAll('.lx-day-live').length,1);
 assert.ok(side.querySelector('.lx-day-changed'));assert.equal(side.querySelectorAll('.lx-groups a').length,4);
 await disable(dom);assert.equal(doc.querySelector('.lx-view'),null);assert.equal(Array.from(doc.querySelector('#contenttable').childNodes).some(n=>n.nodeType===8&&/THESIS:/.test(n.data)),false);await close(dom);
});
