import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {fixture} from '../demo/fixtures.mjs';
import {readModel} from '../src/model.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function mount(path,before=()=>{},mobile=false){
 const dom=new JSDOM(fixture(path,false),{url:'https://www.lectio.dk'+path,runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});
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

test('home moves entire original islands in task order and restores their exact positions',async()=>{
 let native,parent,next;
 const dom=await mount('/lectio/123/forside.aspx',doc=>{native=doc.querySelector('[id$="skemaIsland_pa"]').closest('section');parent=native.parentNode;next=native.nextSibling;});
 const doc=dom.window.document;
 assert.equal(doc.querySelector('.lx-home-workspace').firstElementChild,native);
 assert.deepEqual(Array.from(doc.querySelectorAll('.lx-home-workspace>section')).slice(0,4).map(n=>n.dataset.lxSection),['today','tasks','homework','messages']);
 await disable(dom);assert.equal(native.parentNode,parent);assert.equal(native.nextSibling,next);assert.equal(doc.querySelector('.lx-home-workspace'),null);await close(dom);
});

test('assignment tools filter records, disclose secondary data and preserve native action handlers',async()=>{
 let button,clicks=0,table,input;
 const dom=await mount('/lectio/123/OpgaverElev.aspx',doc=>{table=doc.querySelector('table.lf-grid');button=doc.querySelector('.demo-note');button.addEventListener('click',()=>clicks++);input=doc.querySelector('[id$="FilterHoldelementDD_inp"]');input.value='Dansk';});const doc=dom.window.document;
 assert.equal(doc.querySelector('.demo-note'),button);button.click();assert.equal(clicks,1);
 assert.equal(table.rows[1].cells[0].dataset.lxField,'extra');assert.equal(table.rows[1].cells[6].dataset.lxField,'extra');assert.equal(table.rows[1].cells[9].dataset.lxField,'extra');
 doc.querySelector('.lx-record-detail-toggle').click();await delay(20);assert.ok(table.classList.contains('lx-all-fields'));
 const search=doc.querySelector('.lx-record-search input');const setValue=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;setValue.call(search,'differentialregning');search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await delay(20);
 assert.equal(table.querySelectorAll('.lx-record-row:not(.lx-filtered-out)').length,1);assert.equal(doc.querySelector('.lx-record-count').textContent,'1 af 4 poster');
 await disable(dom);assert.equal(doc.querySelector('table.lf-grid'),table);assert.equal(input.value,'Dansk');assert.equal(table.querySelector('.lx-filtered-out'),null);assert.equal(table.rows[1].cells.length,11);await close(dom);
});

test('mobile folders preserve native links and selection controls without duplicate mobile records',async()=>{
 let folder,parent,checkbox;
 const dom=await mount('/lectio/123/beskeder2.aspx',doc=>{folder=doc.querySelector('.lectiofilepicker-foldertree-col');parent=folder.parentNode;checkbox=doc.querySelector('table input[type=checkbox]');const table=doc.querySelector('table');table.rows[0].cells[1].classList.add('OnlyDesktop');const cell=table.rows[1].insertCell();cell.className='OnlyMobile';cell.textContent='duplicate native mobile subject';table.rows[1].cells[1].classList.add('OnlyDesktop');},true);const doc=dom.window.document;
 assert.equal(doc.querySelector('.lx-folder-disclosure').open,false);assert.equal(doc.querySelector('.lx-folder-content'),folder);assert.equal(doc.querySelectorAll('.lx-native-duplicate').length,1);
 const selection=doc.querySelector('.lx-native-selection');assert.equal(selection.querySelector('input'),checkbox);selection.click();assert.equal(checkbox.checked,true);
 await disable(dom);assert.equal(folder.parentNode,parent);assert.equal(doc.querySelector('table input'),checkbox);assert.equal(doc.querySelector('.lx-native-duplicate'),null);assert.equal(checkbox.closest('label'),null);await close(dom);
});

test('study course focus keeps selected content and original filter values',async()=>{
 let table,filter;
 const dom=await mount('/lectio/123/studieplan.aspx',doc=>{table=doc.querySelector('.yeartable');filter=doc.querySelector('input[type=checkbox]');filter.checked=false;},true);const doc=dom.window.document;const picker=doc.querySelector('.lx-course-picker select');
 assert.equal(picker.value,'2');picker.value='3';picker.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await delay(20);
 assert.ok(table.rows[1].cells[2].classList.contains('lx-course-hidden'));assert.ok(!table.rows[1].cells[3].classList.contains('lx-course-hidden'));assert.ok(!table.rows[1].cells[0].classList.contains('lx-course-hidden'));
 await disable(dom);assert.equal(doc.querySelector('.yeartable'),table);assert.equal(filter.checked,false);assert.equal(table.querySelector('.lx-course-hidden'),null);await close(dom);
});

test('activity actions and editable notes remain original nodes and restore their source containers',async()=>{
 let notes,button,parent;
 const dom=await mount('/lectio/123/aktivitet/aktivitetforside2.aspx',doc=>{notes=doc.querySelector('textarea');notes.value='Unsent draft';button=doc.querySelector('.ls-texteditor-toolbarOuterContainer button');parent=button.parentNode.parentNode;});const doc=dom.window.document;
 assert.equal(doc.querySelector('textarea'),notes);assert.equal(doc.querySelectorAll('.lx-activity-actions button').length,3);assert.equal(doc.querySelectorAll('.lx-activity-actions a').length,1);assert.ok(doc.querySelector('.lx-activity-context svg'));
 await disable(dom);assert.equal(notes.value,'Unsent draft');assert.equal(button.parentNode.parentNode,parent);assert.equal(doc.querySelector('.lx-activity-actions'),null);await close(dom);
});

test('all nine requested routes have task adapters and reports disclose secondary sections',async()=>{
 const routes=[['forside.aspx','home'],['OpgaverElev.aspx','assignments'],['beskeder2.aspx','messages'],['subnav/fravaerelev_fravaersaarsager.aspx','absence'],['grades/grade_report.aspx','grades'],['studieplan.aspx','study'],['DokumentOversigt.aspx','documents'],['BD/UserReservations.aspx','books'],['aktivitet/aktivitetforside2.aspx','activity']];
 for(const [path,kind] of routes){const dom=await mount('/lectio/123/'+path);assert.equal(dom.window.document.querySelector('#contenttable').dataset.lxWorkspace,kind);if(kind==='absence'||kind==='grades')assert.ok(dom.window.document.querySelector('details:not([open])'));await close(dom);}
});

test('new document UpdatePanel content receives the folder and record adapters',async()=>{
 const dom=await mount('/lectio/123/DokumentOversigt.aspx');const doc=dom.window.document;const fresh=new JSDOM(fixture('/lectio/123/DokumentOversigt.aspx',false));const content=doc.querySelector('#contenttable');content.replaceChildren(...Array.from(fresh.window.document.querySelector('#contenttable').childNodes).map(n=>doc.importNode(n,true)));await delay(250);
 assert.ok(content.querySelector('.lx-browser-workspace'));assert.ok(content.querySelector('.lx-page-intro'));assert.equal(content.querySelectorAll('.lx-record-row').length,2);fresh.window.close();await close(dom);
});
