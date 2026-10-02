import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, Home, CalendarDays, ClipboardList, Mail, ChartNoAxesColumn, Star, Users, Folder, Map, LibraryBig, ListChecks, Accessibility, CircleUserRound, CircleHelp, LogOut, LogIn, Search, PanelLeftClose, PanelLeftOpen, Menu, X, ArrowUpRight, ChevronRight, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { api, loadSettings, saveSettings } from './settings.js';
import { readModel, searchItems } from './model.js';
import { routeKey } from './lectio.js';
import { preparePages, restorePages } from './pages.jsx';
import { mountView, unmountView } from './views/index.jsx';

const directionContract = `THESIS: Compact makes Lectio's daily tasks scannable through one persistent sidebar and aligned native content.
OWN-WORLD: White ground, utility-red selection, Source Sans 3, fine rules, quiet lesson fills and Lucide icons.
STORY: Students find their schedule, deadlines, messages and records, then use Lectio's original actions.
FIRST VIEWPORT: A 216px rail and 76px toolbar frame the timetable; home gives daily content a wide left region and tasks a narrow right column. Search sits at top right.
FORM: Japanese high-density web, challenger 1, selected by the user as Compact; direction seed 87765d5f assigned grounded candidate 6.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance`;

const iconFor = { Forside:Home, Skema:CalendarDays, Opgaver:ClipboardList, Beskeder:Mail, Fravær:ChartNoAxesColumn, Karakterer:Star, Hold:Users, Studieplan:Map, Dokumenter:Folder, Lektier:BookOpen, Bøger:LibraryBig, Spørgeskema:ListChecks, SPS:Accessibility, Profil:CircleUserRound, Hjælp:CircleHelp, 'Log ud':LogOut, 'Log ind':LogIn, Hovedmenu:LayoutGrid };

export function followSource(event, item) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (item.source?.isConnected) {
    event.preventDefault();
    item.source.click();
  }
}

function Shell({ initialModel,initialPrefs }) {
 const [model,setModel]=useState(initialModel);
 const [prefs,setPrefs]=useState(initialPrefs);
 const [mobileOpen,setMobileOpen]=useState(false);
 const [isMobile,setIsMobile]=useState(window.matchMedia('(max-width:640px)').matches);
 const [searchOpen,setSearchOpen]=useState(false);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [query,setQuery]=useState('');
 const [activeResult,setActiveResult]=useState(0);
 const [status,setStatus]=useState('');
 const searchRef=useRef(null);
 const searchArea=useRef(null);
 const settingsArea=useRef(null);
 const menuButton=useRef(null);
 const sidebar=useRef(null);
 const results=searchItems(document,model,query);

 useEffect(()=>{
   const onStorage=(changes,area)=>{if(area==='local'&&changes.preferences)setPrefs(p=>({...p,...changes.preferences.newValue}));};
   api?.storage.onChanged.addListener(onStorage);
   const onModel=()=>setModel(readModel());
   document.addEventListener('lectiomizer:refresh',onModel);
   return ()=>{api?.storage.onChanged.removeListener(onStorage);document.removeEventListener('lectiomizer:refresh',onModel);};
 },[]);
 useEffect(()=>{
   const body=document.body;
   body.classList.toggle('lx-enabled',prefs.enabled);
   body.classList.toggle('lx-collapsed',prefs.collapsed);
   body.dataset.lxDensity=prefs.density;
   body.dataset.lxPage=model.kind;
   body.classList.toggle('lx-public',!document.querySelector('#contenttable'));
   if(prefs.enabled)prepareNative();else restoreNative();
 },[prefs,model.kind]);
 useEffect(()=>{const media=window.matchMedia('(max-width:640px)');const change=()=>{setIsMobile(media.matches);if(!media.matches)setMobileOpen(false);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{document.body.classList.toggle('lx-menu-open',mobileOpen);const content=document.getElementById('masterContent');if(content)content.inert=mobileOpen&&isMobile;return()=>{document.body.classList.remove('lx-menu-open');if(content)content.inert=false;};},[mobileOpen,isMobile]);
 useEffect(()=>{
   function keyboard(e){
     if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&prefs.enabled){e.preventDefault();setSearchOpen(true);setTimeout(()=>searchRef.current?.focus(),0);}
     if(e.key==='Escape'){setSearchOpen(false);setSettingsOpen(false);if(mobileOpen){setMobileOpen(false);menuButton.current?.focus();}}
     if(e.key==='Tab'&&mobileOpen){const controls=Array.from(sidebar.current?.querySelectorAll('a,button')||[]).filter(el=>el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
   }
   function outside(e){if(!searchArea.current?.contains(e.target))setSearchOpen(false);if(!settingsArea.current?.contains(e.target))setSettingsOpen(false);}
   document.addEventListener('keydown',keyboard);document.addEventListener('pointerdown',outside);
   return()=>{document.removeEventListener('keydown',keyboard);document.removeEventListener('pointerdown',outside);};
 },[prefs.enabled,mobileOpen]);
 useEffect(()=>{if(mobileOpen) sidebar.current?.querySelector('a,button')?.focus();},[mobileOpen]);
 useEffect(()=>{setActiveResult(0);},[query]);
 const update=async patch=>{setPrefs(p=>({...p,...patch}));try{await saveSettings(patch);}catch{setStatus('Indstillingen kunne ikke gemmes. Prøv igen.');}};
 const primary=model.nav.filter(n=>!['Log ud','Profil','Hjælp','Kontakt'].includes(n.label));
 const utility=model.nav.filter(n=>['Hjælp','Kontakt','Log ud'].includes(n.label));
 const profile=model.nav.find(n=>n.label==='Profil');
 const nativeSearch=document.querySelector('[id$="mastersearchbtn"]');
 const term=document.querySelector('[id$="ChooseTerm_term"]');
 const initials=model.name==='Lectio'?'L':model.name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('');
 if(!prefs.enabled) return <button type="button" className="lx-reenable" onClick={()=>update({enabled:true})}><BookOpen size={18}/> Aktivér Lectiomizer</button>;
 const link=(item,extra='')=>{const Icon=iconFor[item.label]||LayoutGrid;const active=routeKey(item.href)===routeKey(model.url)||(!model.nav.some(n=>routeKey(n.href)===routeKey(model.url))&&({assignments:'Opgaver',messages:'Beskeder',absence:'Fravær',grades:'Karakterer',documents:'Dokumenter',study:'Studieplan',homework:'Lektier'})[model.kind]===item.label);return <a key={item.href} className={`lx-navlink ${active?'lx-active':''} ${extra}`} href={item.href} aria-current={active?'page':undefined} title={prefs.collapsed?item.label:undefined} onClick={e=>{setMobileOpen(false);followSource(e,item);}}><Icon size={20} strokeWidth={1.8} aria-hidden="true"/><span>{item.label}</span></a>;};
 return <>
  <a className="lx-skip" href="#contenttable">Spring til indhold</a>
  {mobileOpen&&<button className="lx-scrim" type="button" tabIndex={-1} aria-label="Luk navigation" onClick={()=>setMobileOpen(false)}/>}
  <aside ref={sidebar} id="lx-sidebar" inert={isMobile&&!mobileOpen} className={`lx-sidebar ${mobileOpen?'lx-open':''}`} aria-label="Lectio navigation">
   <a className="lx-brand" href={model.nav.find(n=>n.label==='Forside')?.href || (model.base?model.base+'default.aspx':'/')} title="Lectiomizer"><BookOpen className="lx-brand-icon" size={25} aria-hidden="true"/><span>lectiomizer<span className="lx-brand-dot">.</span></span></a>
   <div className="lx-school" title={model.school}><span>{model.school}</span>{term&&<span className="lx-term">{term.selectedOptions?.[0]?.textContent}</span>}</div>
   <button className="lx-mobile-close lx-icon-button" type="button" aria-label="Luk navigation" onClick={()=>{setMobileOpen(false);menuButton.current?.focus();}}><X size={20}/></button>
   <nav className="lx-navigation" aria-label="Sider">{primary.map((item,i)=><React.Fragment key={item.href}>{i>0&&item.label==='Studieplan'&&<div className="lx-navdivider"/>}{link(item)}</React.Fragment>)}</nav>
   <div className="lx-sidebar-bottom">
    {isMobile&&term&&!term.disabled&&<label className="lx-sidebar-year">Skoleår<select aria-label="Skoleår i sidepanel" value={term.value} onChange={e=>{term.value=e.target.value;term.dispatchEvent(new Event('change',{bubbles:true}));setModel(readModel());}}>{Array.from(term.options).map(o=><option key={o.value} value={o.value}>{o.textContent}</option>)}</select></label>}
    <div className="lx-utilities">{utility.map(item=>link(item,'lx-utility'))}</div>
    <button type="button" className="lx-collapse lx-navlink" onClick={()=>update({collapsed:!prefs.collapsed})} aria-label={prefs.collapsed?'Udvid sidepanel':'Minimer sidepanel'} title={prefs.collapsed?'Udvid sidepanel':undefined}>{prefs.collapsed?<PanelLeftOpen size={20}/>:<PanelLeftClose size={20}/>}<span>Minimer sidepanel</span></button>
    <a className="lx-profile" href={profile?.href||model.nav.find(n=>n.label==='Log ind')?.href||'#'} onClick={e=>profile&&followSource(e,profile)} title={model.name}><span className="lx-avatar">{model.photo?<img src={model.photo} alt="" onError={e=>{e.currentTarget.hidden=true;}}/>:initials}</span><span className="lx-profile-text"><strong>{model.name}</strong><small>{model.authenticated?'Min profil':'Velkommen'}</small></span><ChevronRight size={16}/></a>
   </div>
  </aside>
  <header className="lx-topbar">
   <div className="lx-title-group"><button ref={menuButton} type="button" className="lx-mobile-toggle lx-icon-button" aria-label="Åbn navigation" aria-controls="lx-sidebar" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(o=>!o)}><Menu size={21}/></button><h1>{model.title}</h1></div>
   <div className="lx-topbar-actions">
    {term&&!term.disabled&&<select className="lx-year-select" aria-label="Skoleår" value={term.value} onChange={e=>{term.value=e.target.value;term.dispatchEvent(new Event('change',{bubbles:true}));setModel(readModel());}}>{Array.from(term.options).map(o=><option key={o.value} value={o.value}>{o.textContent}</option>)}</select>}
    <div className="lx-search-area" ref={searchArea}>
     <div className="lx-searchbox"><Search size={18}/><input ref={searchRef} aria-label="Søg i navigation og på denne side" placeholder="Søg i Lectio…" value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true);}} aria-expanded={searchOpen} aria-controls="lx-search-results" onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setActiveResult(i=>Math.min(i+1,results.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setActiveResult(i=>Math.max(i-1,0));}if(e.key==='Enter'&&results[activeResult]){e.preventDefault();searchArea.current?.querySelector(`[data-result="${activeResult}"]`)?.click();}}}/><kbd>⌘ K</kbd></div>
     {searchOpen&&<div id="lx-search-results" className="lx-search-results"><div className="lx-result-caption">{query?'Søgeresultater':'Gå direkte til'}</div>{results.length?results.map((item,i)=><a data-result={i} key={item.href+item.label} className={`lx-result ${i===activeResult?'lx-result-selected':''}`} href={item.href} onClick={e=>{setSearchOpen(false);followSource(e,item);}}><span>{item.label}</span><small>{item.group}</small><ArrowUpRight size={16}/></a>):<p className="lx-empty">Ingen resultater. Prøv et andet ord.</p>}{nativeSearch&&<button type="button" className="lx-native-search" onClick={()=>{setSearchOpen(false);nativeSearch.click();}}>Søg i beskeder og dokumenter <ArrowUpRight size={15}/></button>}</div>}
    </div>
    <div ref={settingsArea} className="lx-settings-area"><button className="lx-icon-button" type="button" aria-label="Lectiomizer indstillinger" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(o=>!o)}><SlidersHorizontal size={20}/></button>{settingsOpen&&<section className="lx-settings-panel" aria-label="Udseende"><h2>Dit Lectiomizer</h2><label>Afstand<select value={prefs.density} onChange={e=>update({density:e.target.value})}><option value="compact">Kompakt</option><option value="comfortable">Luftig</option></select></label><button type="button" onClick={()=>update({enabled:false})}>Vis Lectios oprindelige design</button><p>Udseendet ændres her. Skolens indhold og handlinger kommer fra Lectio.</p></section>}</div>
   </div>
  </header>
  <span className="lx-live-status" role="status">{status}</span>
 </>;
}

export async function boot() {
 if(document.getElementById('lectiomizer-root'))return;
 const initialPrefs=await loadSettings();
 if(window.top!==window){document.body.classList.toggle('lx-embedded',initialPrefs.enabled);document.dispatchEvent(new Event('lectiomizer:ready'));api?.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.preferences)document.body.classList.toggle('lx-embedded',changes.preferences.newValue?.enabled!==false);});return;}
 document.body.prepend(document.createComment(directionContract));
 const model=readModel();
 document.body.classList.toggle('lx-enabled',initialPrefs.enabled);
 const host=document.createElement('div');host.id='lectiomizer-root';document.body.append(host);
 document.documentElement.classList.add('lx-ready');
 const reactRoot=createRoot(host);reactRoot.render(<Shell initialModel={model} initialPrefs={initialPrefs}/>);
 if(initialPrefs.enabled)prepareNative();
 requestAnimationFrame(()=>requestAnimationFrame(()=>document.dispatchEvent(new Event('lectiomizer:ready'))));
 let timer;
 const observer=new MutationObserver(records=>{
  if(!document.body.classList.contains('lx-enabled')||!records.some(r=>r.target instanceof Element && !r.target.closest('#lectiomizer-root,.lx-view') && (r.type==='childList'||r.attributeName==='class')))return;
  clearTimeout(timer);timer=setTimeout(()=>{prepareNative();document.dispatchEvent(new Event('lectiomizer:refresh'));},120);
 });
 const content=document.querySelector('#contenttable');
 const observed=document.querySelector('[id$="outerContentFrameDiv"]')||content;
 if(observed)observer.observe(observed,{subtree:true,childList:true});
 window.addEventListener('pagehide',event=>{if(event.persisted)return;observer.disconnect();clearTimeout(timer);unmountView();restorePages();reactRoot.unmount();},{once:true});
}

export function prepareNative() {
 const content=document.querySelector('#contenttable');if(!content)return;
 for(const table of content.querySelectorAll('table.lf-grid,table.yeartable,table.s2skema')) {
   if(table.classList.contains('s2skema')&&!table.querySelector('colgroup')&&table.rows[1]?.cells.length<=8){const cols=document.createElement('colgroup');cols.dataset.lxColumns='true';for(let i=0;i<table.rows[1].cells.length;i++){const col=document.createElement('col');if(i===0)col.style.width='82px';cols.append(col);}table.prepend(cols);}
   // Wrapping leaves each table and all of its event handlers intact.
   if(!table.parentElement.classList.contains('lx-table-scroll')){
    const wrap=document.createElement('div');wrap.className='lx-table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',table.classList.contains('s2skema')?'Ugeskema, rul vandret ved behov':'Tabel, rul vandret ved behov');table.before(wrap);wrap.append(table);
   }
 }
 for(const block of content.querySelectorAll('.s2brik')) {
   if(block.style.height)block.style.setProperty('--lx-event-height',block.style.height);
   if(block.dataset.lxSubject)continue;
   const parentWidth=parseFloat(block.parentElement.style.width);
   if(parentWidth&&block.style.left.endsWith('em')&&block.style.width.endsWith('em')){block.dataset.lxResponsive='true';block.style.setProperty('--lx-event-left',`${parseFloat(block.style.left)/parentWidth*100}%`);block.style.setProperty('--lx-event-width',`${parseFloat(block.style.width)/parentWidth*100}%`);}
   const text=block.querySelector('.separator-value')?.textContent||block.textContent;
   let hash=0;for(const char of text.split('•')[0])hash=(hash*31+char.charCodeAt(0))|0;
   block.dataset.lxSubject=String(Math.abs(hash)%5);
 }
 const dashboard=content.querySelector('.ls-dashboard');
 if(dashboard){
   const nodes=Array.from(dashboard.querySelectorAll('[id$="_pa"]')).filter(el=>el.closest('.ls-std-island-layout-col'));
   if(nodes.length)dashboard.classList.add('lx-dashboard');
 }
 const kind=readModel().kind;
 // Rebuilt pages render their own view; everything else is restyled in place.
 if(mountView(content,kind))return;
 preparePages(content,kind);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

export function restoreNative(){
 unmountView();
 restorePages();
 for(const wrap of document.querySelectorAll('.lx-table-scroll'))wrap.replaceWith(...wrap.childNodes);
 for(const cols of document.querySelectorAll('[data-lx-columns]'))cols.remove();
}
