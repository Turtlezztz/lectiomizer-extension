import { text } from '../page-data.js';

// Thrown when a page no longer has the shape a reader expects. The caller then
// leaves Lectio's original page in place instead of rendering partial data.
export class ReaderError extends Error {
  constructor(message) { super(message); this.name = 'ReaderError'; }
}

// Lectio renders desktop cells plus a hidden mobile duplicate per row. Keep the
// desktop set when both exist.
export function nativeCells(row) {
  const cells = Array.from(row.cells).filter(cell => !cell.classList.contains('nodisplay'));
  return cells.some(cell => cell.classList.contains('OnlyDesktop')) ? cells.filter(cell => !cell.classList.contains('OnlyMobile')) : cells;
}

export function headerRow(table) {
  return Array.from(table.rows).find(row => row.cells.length && Array.from(row.cells).every(cell => cell.tagName === 'TH')) || null;
}

export function noRecordText(table) {
  const node = table.querySelector('.noRecord');
  return node ? text(node).replace(/\.{3}$/, '') : null;
}

// Text split on <br>, e.g. "<b>4</b><br><b>vægt: 1,5</b>" → ["4", "vægt: 1,5"].
export function splitLines(node) {
  const lines = [''];
  const walk = n => {
    for (const child of n.childNodes) {
      if (child.nodeName === 'BR') lines.push('');
      else if (child.nodeType === 3) lines[lines.length - 1] += child.textContent;
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(node);
  return lines.map(line => line.replace(/­/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Optional page sections degrade to an error marker instead of failing the page.
export function optional(read) {
  try { return read(); }
  catch (error) { return { error: error.message || 'Ukendt fejl' }; }
}

// A lesson link as Lectio renders it everywhere (schedule, activity header,
// absence lists): "ma 28/9 2. modul - [hold] • [teacher] • 1.07 - [title]".
export function readLesson(link) {
  if (!link) return null;
  const content = link.querySelector('.s2skemabrikcontent.OnlyDesktop') || link.querySelector('.s2skemabrikcontent') || link;
  const people = prefix => Array.from(content.querySelectorAll('[data-lectiocontextcard]')).filter(el => el.dataset.lectiocontextcard.startsWith(prefix)).map(el => text(el));
  const loose = Array.from(content.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const when = (loose[0] || '').replace(/\s*-\s*$/, '');
  // Forside lessons start at the module ("1. modul - …") and carry no date.
  const [, date = /modul/i.test(when) ? '' : when, module = /modul/i.test(when) ? when : ''] = when.match(/^(\S+\s+\d+\/\d+)\s*(.*)$/) || [];
  const room = loose.slice(1).map(s => s.replace(/^•\s*/, '').replace(/\s*-\s*$/, '').trim()).filter(s => s && s !== '•').pop() || '';
  const status = link.classList.contains('s2cancelled') ? 'cancelled' : link.classList.contains('s2changed') ? 'changed' : 'normal';
  return {
    href: link.getAttribute('href') ? link.href : null,
    date, module, room, status,
    holds: people('H'), teachers: people('T'),
    title: text(content.querySelector('.s2skemabrik-std-title')),
    homework: !!link.querySelector('.ls-lektier'), note: !!link.querySelector('.ls-note'),
  };
}

// A table whose first row holds the headings → [{label: cell}] using desktop cells.
export function readRows(table) {
  const head = headerRow(table);
  if (!head) return { labels: [], rows: [] };
  const labels = nativeCells(head).map(cell => text(cell));
  const rows = Array.from(table.rows).filter(row => row !== head && row.querySelector(':scope>td')).map(row => {
    const cells = nativeCells(row);
    return cells.length === labels.length ? { row, cells: Object.fromEntries(labels.map((label, i) => [label, cells[i]])) } : null;
  }).filter(Boolean);
  return { labels, rows };
}

// Lectio icon buttons carry a Material icon name as text, e.g. "arrow_back".
export function iconLink(root, icon) {
  return Array.from(root?.querySelectorAll('a') || []).find(a => text(a.querySelector('.ls-fonticon')) === icon) || null;
}

// Visible label of an icon button: "printUdskriv i A4-format" → "Udskriv i A4-format"
export function iconLabel(link) {
  const icon = text(link.querySelector('.ls-fonticon'));
  const label = text(link);
  return icon && label.startsWith(icon) ? label.slice(icon.length).trim() : label;
}

// "23/8-2026 21:00:00" or "23/8-2026 21:00" → Date (local time)
export function parseLectioDate(value) {
  const m = (value || '').match(/(\d{1,2})\/(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
}
