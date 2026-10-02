// Reads forside.aspx. Every dashboard island shares one shape (a linked
// heading with a count, then rows with a link, optional sender and a time
// cell), so islands are read generically and only the schedule is special.
import { text } from '../page-data.js';
import { ReaderError, parseLectioDate, readLesson } from './util.js';

const islandKey = el => (el.id.match(/_([A-Za-z]+Island)_pa$/) || [])[1] || el.id;

// "5/10-2026 08:15 til 09:45" (first line of a lesson's tooltip)
export function parseLessonTime(tooltip = '') {
  const m = tooltip.match(/(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s+til\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, y, h1, m1, h2, m2] = m.map(Number);
  return { start: new Date(y, mo - 1, d, h1, m1), end: new Date(y, mo - 1, d, h2, m2) };
}

function readSchedule(island) {
  const days = [];
  for (const child of Array.from(island?.children || [])) {
    if (child.classList.contains('dashboardTextHeader')) { days.push({ label: text(child), lessons: [] }); continue; }
    const link = child.matches('a.s2skemabrik') ? child : child.querySelector('a.s2skemabrik');
    if (!link) continue;
    if (!days.length) days.push({ label: '', lessons: [] });
    days.at(-1).lessons.push({ ...readLesson(link), time: parseLessonTime(link.getAttribute('data-tooltip') || '') });
  }
  return days;
}

function readRows(table) {
  return Array.from(table?.rows || []).filter(row => row.querySelector('td.infoCol')).map(row => {
    const info = row.querySelector('td.infoCol');
    const link = info.querySelector('a[href]');
    const time = row.querySelector('td.timeCol');
    const name = row.querySelector('td.nameCol [title], td.nameCol');
    const priority = (info.className.match(/prio(\d)/) || [])[1];
    return {
      text: text(info), href: link ? link.href : null,
      detail: info.getAttribute('title') || row.getAttribute('title') || '',
      rowTitle: row.getAttribute('title') || '',
      important: priority === '1',
      sender: text(name), senderTitle: name?.getAttribute?.('title') || '',
      due: parseLectioDate(time?.getAttribute('title') || text(time)), dueText: text(time), urgent: !!time?.classList.contains('attention'),
      node: info,
    };
  });
}

function readBlock(island) {
  const header = island.querySelector('.dashboardLinkHeader');
  const titleLink = header?.querySelector('a.dashboardItemTitle');
  return {
    key: islandKey(island),
    title: text(header?.querySelector('.dashboardLinkHeaderText') || island.querySelector('.dashboardTextHeader')),
    href: titleLink ? titleLink.href : null,
    info: text(header?.querySelector('.dashboardLinkHeaderInfoText')),
    rows: readRows(island.querySelector('table.dashboard')),
  };
}

// "Hold: 3a Da, Titel: Novelleanalyse, frist: 9/10-2026 23:59"
export function parseAssignmentTitle(value = '') {
  const pick = key => value.match(new RegExp(key + ':\\s*(.*?)(?=,\\s*\\w+:|$)', 'i'))?.[1]?.trim() || '';
  return { hold: pick('Hold'), title: pick('Titel') };
}

export function readHome(doc) {
  const islands = Array.from(doc.querySelectorAll('#contenttable [id$="Island_pa"]'));
  if (!islands.length) throw new ReaderError('Forsidens blokke blev ikke fundet');
  const byKey = new Map(islands.map(el => [islandKey(el), el]));
  const block = key => byKey.has(key) ? readBlock(byKey.get(key)) : null;
  const groups = byKey.get('holdgruppeIsland');
  const known = new Set(['skemaIsland', 'ElevOpgaveAfleveringerIsland', 'LektierIsland', 'kommIsland', 'AktuelInformationIsland', 'RegistreringerIsland', 'holdgruppeIsland']);
  return {
    days: readSchedule(byKey.get('skemaIsland')),
    assignments: block('ElevOpgaveAfleveringerIsland'),
    homework: block('LektierIsland'),
    messages: block('kommIsland'),
    notices: block('AktuelInformationIsland'),
    registrations: block('RegistreringerIsland'),
    groups: groups ? Array.from(groups.querySelectorAll('a[href]')).map(a => ({ label: text(a), href: a.href })) : [],
    other: islands.filter(el => !known.has(islandKey(el))).map(readBlock).filter(b => b.title || b.rows.length),
    scheduleHref: new URL('SkemaNy.aspx', doc.location?.href || doc.URL).href,
  };
}
