import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,ChevronDown,CalendarDays} from 'lucide-react';
import {tableModel,text} from './page-data.js';

const states=new Map();
const pageCopy={assignments:['Dine afleveringer','Find opgaven, se fristen og følg status.'],messages:['Din indbakke','Mapper og beskeder samlet i én arbejdsflade.'],absence:['Dit fravær','Fraværsårsager først. Registreringer samlet nedenfor.'],grades:['Dine resultater','Fag og karakterer først. Noter og bevisdata i egne afsnit.'],study:['Din undervisning','Følg ét hold ad gangen, eller sammenlign alle hold.'],documents:['Dine dokumenter','Find en mappe, søg efter en fil og brug de originale filhandlinger.'],books:['Dine boglån','Se bøger og afleveringsfrister samlet.'],activity:['Lektion og materialer','Aktivitetens indhold, lektier og handlinger samlet.']};
function owned(state,tag,cls){const el=document.createElement(tag);el.className=cls;el.dataset.lxOwned='';state.owned.push(el);return el;}
function addClass(state,el,name){if(!el||el.classList.contains(name))return;el.classList.add(name);state.classes.push([el,name]);}
function attr(state,el,name,value){if(el.getAttribute(name)===String(value))return;state.attrs.push([el,name,el.getAttribute(name)]);el.setAttribute(name,value);}
function move(state,node,target){if(node.parentElement===target)return;const marker=document.createComment('lectiomizer original position');node.before(marker);state.moves.push({node,marker});target.append(node);}
function title(state,parent,label){const el=owned(state,'h2','lx-workspace-heading');el.textContent=label;parent.prepend(el);return el;}
function fold(state,node,label,open=false){if(node.parentElement?.classList.contains('lx-disclosure'))return node.parentElement;const detail=owned(state,'details','lx-disclosure');detail.open=open;const summary=document.createElement('summary');summary.textContent=label;detail.append(summary);node.before(detail);move(state,node,detail);return detail;}
function mount(state,node,component){const root=createRoot(node);root.render(component);state.roots.push(root);}
function RecordTools({table,rows}){
 const [query,setQuery]=useState('');const [expanded,setExpanded]=useState(false);const [count,setCount]=useState(rows.length);
 useEffect(()=>{const q=query.trim().toLocaleLowerCase('da');let n=0;for(const {row} of rows){const match=!q||text(row).toLocaleLowerCase('da').includes(q);row.classList.toggle('lx-filtered-out',!match);if(match)n++;}setCount(n);return()=>rows.forEach(({row})=>row.classList.remove('lx-filtered-out'));},[query,rows]);
 useEffect(()=>{table.classList.toggle('lx-all-fields',expanded);return()=>table.classList.remove('lx-all-fields');},[expanded,table]);
 return <><label className="lx-record-search"><Search size={18} aria-hidden="true"/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Søg i denne liste…" aria-label="Søg i denne liste"/></label><span className="lx-record-count" role="status">{count} af {rows.length} poster</span><button type="button" className="lx-record-detail-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Vis færre felter':'Vis alle felter'}<ChevronDown size={16} aria-hidden="true"/></button>{query&&count===0&&<p className="lx-record-empty">Ingen poster matcher. Prøv et andet ord, eller ryd søgningen.</p>}</>;
}
function StudyTools({table,model}){
 const context=s=>/^(måned|uge|elevtid)$/i.test(s.trim());
 const courses=model.labels.map((label,index)=>({label,index})).filter(c=>c.label&&!context(c.label)&&!c.label.includes(' · '));
 const [selected,setSelected]=useState(()=>window.matchMedia('(max-width:640px)').matches&&courses.length?String(courses[0].index):'all');
 useEffect(()=>{table.classList.toggle('lx-study-focus',selected!=='all');for(const row of Array.from(table.rows))for(const cell of Array.from(row.cells)){const start=Number(cell.dataset.lxColumn);const label=cell.dataset.lxLabel||'';const keep=selected==='all'||context(label)||(start<=Number(selected)&&start+(cell.colSpan||1)>Number(selected));cell.classList.toggle('lx-course-hidden',!keep);}return()=>{table.classList.remove('lx-study-focus');table.querySelectorAll('.lx-course-hidden').forEach(c=>c.classList.remove('lx-course-hidden'));};},[selected,table]);
 return <label className="lx-course-picker">Hold<select value={selected} onChange={e=>setSelected(e.target.value)} aria-label="Vis hold i studieplan"><option value="all">Alle hold — sammenlign</option>{courses.map(c=><option key={c.index} value={c.index}>{c.label}</option>)}</select></label>;
}
function pageIntro(state,content,kind){const copy=pageCopy[kind];if(!copy)return;const intro=owned(state,'header','lx-page-intro');const heading=document.createElement('h2');heading.textContent=copy[0];const desc=document.createElement('p');desc.textContent=copy[1];intro.append(heading,desc);content.prepend(intro);}
function prepareTable(state,table,kind){
 if(table.dataset.lxRecordPrepared)return;
 if(table.closest('.lec-context-menu,.ls-grades-mobile-table')||table.classList.contains('s2skema'))return;
 const model=tableModel(table);if(!model.labels.some(Boolean))return;
 if(table.querySelector('table')&&kind!=='messages'&&kind!=='books')return;
 attr(state,table,'data-lx-record-prepared','true');
 for(const row of Array.from(table.rows)){let col=0;for(const cell of Array.from(row.cells)){attr(state,cell,'data-lx-column',col);if(cell.tagName==='TH')attr(state,cell,'data-lx-label',model.labels[col]||text(cell));col+=cell.colSpan||1;}}
 for(const {entries} of model.rows)for(const item of entries)attr(state,item.cell,'data-lx-column',item.column);
 if(kind==='study'){
   addClass(state,table,'lx-study-table');for(const {entries} of model.rows)for(const item of entries)attr(state,item.cell,'data-lx-label',item.label);
   const host=owned(state,'div','lx-study-tools');table.parentElement.before(host);mount(state,host,<StudyTools table={table} model={model}/>);return;
 }
 addClass(state,table,'lx-record-table');
 let hasExtra=false;
 const dataRows=[];
 for(const {row,entries} of model.rows){
   if(!entries.length||entries.every(i=>i.cell.colSpan>1))continue;
   if(row.classList.contains('ls-hidden')||row.hidden)continue;
   addClass(state,row,'lx-record-row');dataRows.push({row});
   const hasDesktop=entries.some(i=>i.cell.classList.contains('OnlyDesktop'));
   for(const {cell,label,kind:field} of entries){
     if(hasDesktop&&cell.classList.contains('OnlyMobile')){addClass(state,cell,'lx-native-duplicate');continue;}
     const controls=cell.querySelector('input:not([type="hidden"]),select,textarea,button,input[type="image"]')||(!label&&cell.querySelector('a,[onclick]'));
     const selection=cell.querySelector('input[type=checkbox]');
     const secondary=kind==='assignments'&&/^(uge|fravær|karakter)$/i.test(label);
     const actual=selection?'selection':controls?'action':secondary?'extra':field;
     if(selection&&!selection.closest('.lx-native-selection')){const labelNode=owned(state,'label','lx-native-selection');labelNode.setAttribute('aria-label',selection.getAttribute('aria-label')||'Vælg post');selection.before(labelNode);move(state,selection,labelNode);addClass(state,row,'lx-selectable-row');}
     attr(state,cell,'data-lx-label',label||(actual==='action'?'Vælg / handling':'Oplysning'));
     attr(state,cell,'data-lx-field',actual);
     if(actual==='extra')hasExtra=true;
   }
 }
 if(!hasExtra)addClass(state,table,'lx-no-extra-fields');
 const wrap=table.parentElement;addClass(state,wrap,'lx-record-list');
 const host=owned(state,'div','lx-record-tools');wrap.before(host);mount(state,host,<RecordTools table={table} rows={dataRows}/>);
}
function dashboard(state,content){
 const source=content.querySelector('.ls-dashboard');if(!source)return;
 const items=Array.from(source.querySelectorAll('[id$="Island_pa"]')).map(el=>({el:el.closest('section')||el,id:el.id}));
 const unique=items.filter((v,i,a)=>a.findIndex(x=>x.el===v.el)===i);
 if(!unique.length)return;
 let area=source.querySelector('.lx-home-workspace');if(!area){area=owned(state,'div','lx-home-workspace');source.prepend(area);}
 const labels=[['skemaIsland','I dag','today'],['ElevOpgaveAfleveringerIsland','Opgaver','tasks'],['LektierIsland','Lektier','homework'],['kommIsland','Beskeder','messages'],['AktuelInformationIsland','Aktuel information','information'],['SpoergeskemaIsland','Spørgeskemaer','questionnaires'],['holdgruppeIsland','Hold og grupper','groups']];
 const rank=id=>{const i=labels.findIndex(([name])=>id.endsWith('_'+name+'_pa'));return i<0?99:i;};
 unique.sort((a,b)=>rank(a.id)-rank(b.id));
 for(const item of unique){const match=labels.find(([name])=>item.id.endsWith('_'+name+'_pa'));move(state,item.el,area);addClass(state,item.el,'lx-home-section');if(match){attr(state,item.el,'data-lx-section',match[2]);const existing=item.el.querySelector('h2,h3,.islandHeader');if(!text(existing))title(state,item.el,match[1]);}else attr(state,item.el,'data-lx-section','other');}
 addClass(state,source,'lx-home-rebuilt');
}
function fileBrowser(state,content,kind){
 const browser=content.querySelector('.ls-lectiofilepicker-container');if(!browser)return;
 addClass(state,browser,'lx-browser-workspace');
 const folders=browser.querySelector('.lectiofilepicker-foldertree-col,.demo-folder-list');
 const main=browser.querySelector('.lectiofilepicker-foldercontent-col,.demo-folder-content');
 if(folders){addClass(state,folders,'lx-folder-content');const details=fold(state,folders,'Mapper',!window.matchMedia('(max-width:720px)').matches);addClass(state,details,'lx-folder-disclosure');const icon=owned(state,'span','lx-folder-chevron');icon.setAttribute('aria-hidden','true');details.querySelector('summary').append(icon);mount(state,icon,<ChevronDown size={18}/>);const media=window.matchMedia('(max-width:720px)');const change=()=>{details.open=!media.matches;};media.addEventListener('change',change);state.cleanups.push(()=>media.removeEventListener('change',change));}
 if(main)addClass(state,main,'lx-browser-main');
 for(const toolbar of browser.querySelectorAll('.ls-std-toolbar-filled,.ls-std-toolbar,.ls-std-rowblock'))addClass(state,toolbar,'lx-native-actions');
 if(kind==='messages'){const detail=content.querySelector('[id$="ThreadPanel"],[id$="MessagePanel"],.message-detail');if(detail)addClass(state,detail,'lx-message-reading');}
}
function sections(state,content,kind){
 const scope=kind==='grades'?(content.querySelector('#printallarea')||content):content;
 const panels=Array.from(scope.querySelectorAll('section.lf-island,section.ls-island2,.ls-island3')).filter(el=>!el.parentElement.closest('section.lf-island,section.ls-island2'));
 if(!panels.length)return;
 if(kind==='absence'){
   const cause=panels.find(el=>el.querySelector('[id$="FatabMissingAarsagerGV"]'));const history=panels.find(el=>el.querySelector('[id$="FatabAbsenceFravaerGV"]'));
   if(cause){addClass(state,cause,'lx-absence-priority');const container=cause.parentElement;const first=Array.from(container.children).find(el=>el.tagName==='SECTION');if(first&&first!==cause){const holder=owned(state,'div','lx-absence-first');first.before(holder);move(state,cause,holder);}}
   if(history)fold(state,history,'Fraværsregistreringer');
 }else if(kind==='grades'){
   const notes=panels.filter(el=>/noter|bemærkninger|protokol|bevistype/i.test(text(el.querySelector('.islandHeader,h2,h3'))) || el.querySelector('[id$="KarakterNoterGrid"],[id$="remarks_grid_remarks_grid"],[id$="ProtokolLinierGrid"]'));
   for(const panel of notes){const label=text(panel.querySelector('.islandHeader,h2,h3'))||'Supplerende oplysninger';fold(state,panel,label);}
   addClass(state,scope,'lx-grades-workspace');
 }
 for(const panel of panels)addClass(state,panel,'lx-native-section');
}
function activity(state,content){
 const area=content.querySelector('#PrintAktivititetArea');if(!area){for(const panel of content.querySelectorAll('.islandContent'))addClass(state,panel,'lx-lesson-reading');return;}
 addClass(state,area,'lx-activity-workspace');const editor=area.querySelector('.ls-texteditor-container');if(editor)addClass(state,editor,'lx-activity-editor');
 const toc=area.querySelector('.ls-tocContainer-outer');if(toc){const detail=fold(state,toc,'Indhold i lektionen',!window.matchMedia('(max-width:720px)').matches);addClass(state,detail,'lx-activity-toc');}
 const paper=area.querySelector('.ls-tocContent-outer');if(paper)addClass(state,paper,'lx-lesson-reading');
 const header=area.querySelector('[id$="actHeader"]');if(header){addClass(state,header,'lx-activity-context');const icon=owned(state,'span','lx-activity-icon');icon.setAttribute('aria-hidden','true');header.prepend(icon);mount(state,icon,<CalendarDays size={22}/>);}
 const actions=owned(state,'div','lx-activity-actions');content.querySelector('.lx-page-intro')?.after(actions);
 const toolbars=Array.from(content.querySelectorAll('.ls-std-toolbar-filled,.lectioTabToolbar,.ls-texteditor-toolbarOuterContainer')).filter(el=>!el.parentElement.closest('.ls-std-toolbar-filled,.lectioTabToolbar,.ls-texteditor-toolbarOuterContainer'));
 for(const toolbar of toolbars){addClass(state,toolbar,'lx-native-actions');move(state,toolbar,actions);}
}
export function preparePages(content,kind){
 if(!['home','assignments','messages','absence','grades','study','documents','books','activity'].includes(kind))return;
 let state=states.get(content);
 if(!state){state={content,kind,moves:[],owned:[],classes:[],attrs:[],roots:[],cleanups:[]};states.set(content,state);attr(state,content,'data-lx-workspace',kind);addClass(state,content,'lx-page-workspace');pageIntro(state,content,kind);if(kind==='home')dashboard(state,content);if(kind==='documents'||kind==='messages')fileBrowser(state,content,kind);if(kind==='absence'||kind==='grades')sections(state,content,kind);if(kind==='activity')activity(state,content);}
 // Lectio may replace an UpdatePanel without replacing the outer content node.
 if(pageCopy[kind]&&!content.querySelector('.lx-page-intro'))pageIntro(state,content,kind);
 if(kind==='home')dashboard(state,content);
 if((kind==='messages'||kind==='documents')&&content.querySelector('.ls-lectiofilepicker-container:not(.lx-browser-workspace)'))fileBrowser(state,content,kind);
 if((kind==='absence'||kind==='grades')&&content.querySelector('section.lf-island:not(.lx-native-section)'))sections(state,content,kind);
 if(kind==='activity'&&content.querySelector('#PrintAktivititetArea:not(.lx-activity-workspace)'))activity(state,content);
 if(kind!=='home'&&kind!=='activity')for(const table of content.querySelectorAll('table.lf-grid,table.yeartable,table.ls-table-layout2'))prepareTable(state,table,kind);
}
export function restorePages(){
 for(const state of states.values()){
   state.cleanups.forEach(fn=>fn());state.roots.forEach(root=>root.unmount());
   for(const {node,marker} of state.moves.toReversed()){if(marker.parentNode)marker.replaceWith(node);}
   for(const [el,name,value] of state.attrs.toReversed()){if(value===null)el.removeAttribute(name);else el.setAttribute(name,value);}
   for(const [el,name] of state.classes)el.classList.remove(name);
   for(const node of state.owned)node.remove();
 }
 states.clear();
}
