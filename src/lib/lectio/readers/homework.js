// Reads material_lektieoversigt.aspx: one row per coming lesson with homework
// (date, the lesson brick, then a link per homework item and the lesson note).
// The items only carry their heading here; the full text is on the lesson page.
import { text } from '../page-data.js';
import { ReaderError, nativeCells, parseTooltip, readLesson } from './util.js';

// "to 3/12" → the nearest 3 December (the page only lists coming lessons).
function shortDate(value, now) {
  const m = value.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const date = new Date(now.getFullYear(), +m[2] - 1, +m[1]);
  if (date.getTime() < now.getTime() - 180 * 86_400_000) date.setFullYear(date.getFullYear() + 1);
  return date;
}

export function readHomework(doc, now = new Date()) {
  const table = doc.querySelector('table[id$="LektieOverblikGV"]');
  if (!table) {
    if (!doc.querySelector('#contenttable')) throw new ReaderError('Lektieoversigten blev ikke fundet');
    return { rows: [] };
  }
  const rows = [];
  for (const row of Array.from(table.rows)) {
    const cells = nativeCells(row);
    const brick = cells.map(cell => cell.querySelector('a.s2skemabrik')).find(Boolean);
    if (!brick) continue;
    const tip = parseTooltip(brick.getAttribute('data-tooltip') || '');
    const content = cells.at(-1);
    const seen = new Set();
    const items = Array.from(content.querySelectorAll('a[href]'))
      .filter(a => !a.classList.contains('s2skemabrik'))
      .map(a => ({ title: text(a), href: a.href }))
      .filter(item => item.title && !seen.has(item.title + item.href) && seen.add(item.title + item.href));
    const rest = content.cloneNode(true);
    rest.querySelectorAll('a').forEach(a => a.remove());
    rows.push({
      lesson: readLesson(brick),
      start: tip ? new Date(tip.start) : shortDate(text(cells[0]), now),
      end: tip ? new Date(tip.end) : null,
      details: tip?.details || '',
      items,
      note: text(rest),
    });
  }
  return { rows };
}
