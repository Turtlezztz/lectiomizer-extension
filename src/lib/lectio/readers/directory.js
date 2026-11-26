// Reads FindSkema.aspx?type=elev|laerer|lokale: Lectio's lists of students,
// teachers and rooms. Every entry is a link to that person's or room's
// SkemaNy.aspx, which is also where its id lives. Long lists (students) are
// split by first letter (?forbogstav=); those letter links are returned too.
import { text } from '../page-data.js';

const ID_PARAM = { elev: 'elevid', laerer: 'laererid', lokale: 'id' };

/** { kind, id } for a SkemaNy.aspx link to a student, teacher or room schedule, else null. */
export function scheduleTarget(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (!/\/skemany\.aspx$/i.test(url.pathname)) return null;
  const kind = (url.searchParams.get('type') || '').toLowerCase();
  const id = ID_PARAM[kind] && url.searchParams.get(ID_PARAM[kind]);
  return id ? { kind, id } : null;
}

export function readDirectory(doc) {
  // Lectio's own menus link to the signed-in student's schedule; only read the list itself.
  const root = doc.querySelector('[id$="listecontainer"]') || doc.querySelector('#contenttable, .ls-content-container, [id$="_Content"]') || doc.body;
  const items = new Map();
  for (const a of root.querySelectorAll('a[href]')) {
    if (a.closest('#s_m_mastermenu, .ls-master-header-container, [id$="subnavigator_generic_tr"]')) continue;
    const target = scheduleTarget(a.href);
    const label = text(a);
    if (!target || !label) continue;
    const key = `${target.kind}:${target.id}`;
    if (!items.has(key)) items.set(key, { ...target, label, href: a.href, title: a.getAttribute('title') || '' });
  }
  const letters = [];
  for (const a of doc.querySelectorAll('a[href*="forbogstav=" i]')) {
    if (!letters.some(l => l.href === a.href)) letters.push({ label: text(a), href: a.href });
  }
  return { items: Array.from(items.values()), letters };
}
