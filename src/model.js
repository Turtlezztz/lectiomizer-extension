import { cleanLabel, fullPhoto, navigationFromDOM, pageKind, routeKey, schoolBase, selectors } from './lectio.js';

const studentPaths = [
  ['Forside','forside.aspx'], ['Skema','SkemaNy.aspx'], ['Opgaver','OpgaverElev.aspx'],
  ['Beskeder','beskeder2.aspx'], ['Lektier','material_lektieoversigt.aspx'],
  ['Fravær','subnav/fravaerelev_fravaersaarsager.aspx'], ['Karakterer','grades/grade_report.aspx'],
  ['Studieplan','studieplan.aspx?displaytype=ugeteksttabel'], ['Dokumenter','DokumentOversigt.aspx'],
  ['Bøger','BD/UserReservations.aspx'], ['Spørgeskema','spoergeskema/spoergeskema_rapport.aspx'],
  ['SPS','Elev_SPS.aspx'], ['Profil','indstillinger/studentIndstillinger.aspx'],
];
const order = new Map(studentPaths.map(([label],index)=>[label,index]));

export function readModel(doc = document, url = location.href) {
  const base = schoolBase(url);
  let nav = navigationFromDOM(doc, url);
  const authenticated = nav.some(n => n.label === 'Log ud');
  // Detail pages sometimes omit student subnavigation. These routes were
  // verified in a student session; no school or student id is hardcoded.
  if (authenticated && !nav.some(n=>n.label === 'Opgaver')) {
    nav = [...studentPaths.map(([label,path])=>({label,href:new URL(base + path,url).href})),...nav];
  }
  if (!base) {
    nav = Array.from(doc.querySelectorAll('a[href]')).filter(a=> !a.closest('#lectiomizer-root')).map(source=>({label:cleanLabel(source.textContent),href:source.href,source})).filter(n=>n.label && new URL(n.href).origin === new URL(url).origin && !n.href.includes('#'));
  }
  const unique = new Map();
  for (const item of nav) if (!unique.has(routeKey(item.href))) unique.set(routeKey(item.href),item);
  nav = Array.from(unique.values()).sort((a,b)=>(order.get(a.label)??99)-(order.get(b.label)??99));
  const current = nav.find(n=>routeKey(n.href)===routeKey(url));
  const rawTitle = doc.querySelector(selectors.title)?.textContent.trim() || doc.title.split(' - Lectio')[0];
  let title = current?.label || rawTitle.split(/\s+-\s+/).pop() || 'Lectio';
  if (pageKind(url)==='home') title = 'Min hverdag';
  if (pageKind(url)==='schedule') title = 'Skema';
  if (pageKind(url)==='activity') title = 'Aktivitet';
  const schoolElement = doc.querySelector(selectors.school) || doc.querySelector('[id$="masterleftDiv"]');
  const school = schoolElement?.childNodes ? Array.from(schoolElement.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim() || schoolElement.querySelector('span')?.textContent.trim() : '';
  const studentMatch = rawTitle.match(/^Eleven\s+(.+?)(?:,|\s+-)/);
  const name = studentMatch?.[1] || (authenticated ? 'Min profil' : 'Lectio');
  const photoElement=doc.querySelector('[id$="picctrlthumbimage"]');
  let photo=null;try{const u=new URL(photoElement?.getAttribute('src')||'',url);if(photoElement?.getAttribute('src')&&u.origin===new URL(url).origin)photo=fullPhoto(u.href);}catch{}
  return { photo,nav, title, school:school || 'Lectio', name, authenticated, base, kind:pageKind(url), url };
}

export function searchItems(doc, model, query) {
  const q=query.trim().toLocaleLowerCase('da');
  const onPage=Array.from(doc.querySelectorAll('#contenttable a[href]')).filter(a=>!a.closest('.lec-context-menu')&&/^https?:$/.test(new URL(a.href).protocol)).map(source=>({label:cleanLabel(source.textContent),href:source.href,source,group:'På denne side'}));
  const items=[...model.nav.map(n=>({...n,group:'Navigation'})),...onPage];
  const seen=new Set();
  return items.filter(i=>i.label && (!q||i.label.toLocaleLowerCase('da').includes(q))).filter(i=>{const k=i.href+'|'+i.label;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,12);
}
