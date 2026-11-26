// Reads FindSkema.aspx?type=elev|laerer|lokale: Lectio's lists of students,
// teachers and rooms. Every entry is a link to that person's or room's
// SkemaNy.aspx, which is also where its id lives. Long lists (students) are
// split by first letter (?forbogstav=); those letter links are returned too.
import { text } from '../page-data.js';

/**
 * { kind, id } for a SkemaNy.aspx link to a student, teacher or room schedule, else null.
 * FindSkema links students and teachers without `type` (SkemaNy.aspx?elevid=…,
 * ?laererid=…); rooms are SkemaNy.aspx?type=lokale&id=…
 */
export function scheduleTarget(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (!/\/skemany\.aspx$/i.test(url.pathname)) return null;
  const q = url.searchParams;
  const type = (q.get('type') || '').toLowerCase();
  if (q.get('elevid') && (!type || type === 'elev')) return { kind: 'elev', id: q.get('elevid') };
  if (q.get('laererid') && (!type || type === 'laerer')) return { kind: 'laerer', id: q.get('laererid') };
  if (type === 'lokale' && q.get('id')) return { kind: 'lokale', id: q.get('id') };
  return null;
}

/** Room links put the room number in a span: "<span>0.01</span>Proceskøkken" → "0.01 Proceskøkken". */
function linkLabel(a) {
  const symbol = a.querySelector('.findskema-symbol');
  if (!symbol) return text(a);
  const rest = Array.from(a.childNodes).filter(n => n !== symbol).map(n => n.textContent).join(' ');
  return [text(symbol), text({ textContent: rest })].filter(Boolean).join(' ');
}

export function readDirectory(doc) {
  // Lectio's own menus link to the signed-in student's schedule; only read the list itself.
  const root = doc.querySelector('[id$="listecontainer"]') || doc.querySelector('#contenttable, .ls-content-container, [id$="_Content"]') || doc.body;
  const items = new Map();
  for (const a of root.querySelectorAll('a[href]')) {
    if (a.closest('#s_m_mastermenu, .ls-master-header-container, [id$="subnavigator_generic_tr"]')) continue;
    const target = scheduleTarget(a.href);
    const label = linkLabel(a);
    if (!target || !label) continue;
    const key = `${target.kind}:${target.id}`;
    if (!items.has(key)) items.set(key, { ...target, label, href: a.href, title: a.getAttribute('title') || '' });
  }
  const letters = [];
  for (const a of doc.querySelectorAll('a[href*="forbogstav=" i]')) {
    // Skip e.g. the help link, whose prevurl mentions forbogstav.
    if (!/\/findskema\.aspx$/i.test(new URL(a.href).pathname)) continue;
    if (!letters.some(l => l.href === a.href)) letters.push({ label: text(a), href: a.href });
  }
  return { items: Array.from(items.values()), letters };
}
