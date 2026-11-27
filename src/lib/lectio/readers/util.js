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

const TIME = /^(\d{1,2})\/(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s+til\s+(?:(\d{1,2})\/(\d{1,2})-(\d{4})\s+)?(\d{1,2}):(\d{2})/;
const FIELD = /^(Hold|Lærere?|Lokaler?|Elever?|Grupper?|Ressourcer?)\s*:\s*(.*)$/i;
const FIELD_NAMES = { hold: 'holds', 'lærer': 'teachers', 'lærere': 'teachers', lokale: 'rooms', lokaler: 'rooms' };
const pad = n => String(n).padStart(2, '0');
const stamp = (y, m, d, h, min) => `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}`;

// "Ændret!\nNovelleanalyse\n5/10-2026 08:15 til 09:45\nHold: 3a Da\nLærer: …\nLokale: A12\n\nLektier:\n- …"
export function parseTooltip(tooltip = '') {
  const lines = tooltip.split(/\r?\n/).map(line => line.trim());
  const at = lines.findIndex(line => TIME.test(line));
  if (at < 0) return null;
  const [, d, m, y, h1, m1, d2, mo2, y2, h2, m2] = lines[at].match(TIME);
  const start = stamp(y, m, d, h1, m1);
  const end = d2 ? stamp(y2, mo2, d2, h2, m2) : stamp(y, m, d, h2, m2);
  let status = 'normal';
  const titles = [];
  for (const line of lines.slice(0, at).filter(Boolean)) {
    if (/^aflyst!?$/i.test(line)) status = 'cancelled';
    else if (/^ændret!?$/i.test(line)) status = 'changed';
    else titles.push(line);
  }
  const fields = {};
  let rest = at + 1;
  for (; rest < lines.length; rest++) {
    const field = lines[rest].match(FIELD);
    if (!field) break;
    const key = field[1].toLocaleLowerCase('da');
    fields[FIELD_NAMES[key] || key] = field[2];
  }
  return { start, end, status, title: titles.join(' '), fields, details: lines.slice(rest).join('\n').trim() };
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
  return fillFromTooltip({
    href: link.getAttribute('href') ? link.href : null,
    date, module, room, status,
    holds: people('H'), teachers: people('T'),
    title: text(content.querySelector('.s2skemabrik-std-title')),
    homework: !!link.querySelector('.ls-lektier'), note: !!link.querySelector('.ls-note'),
  }, parseTooltip(link.getAttribute('data-tooltip') || ''));
}

const shortened = (value = '') => /\.{3}|…/.test(value);
const names = (value = '') => value.split(',').map(s => s.trim()).filter(Boolean);
// "08:15 - 10:20 - ... • ..." → "08:15 - 10:20"; "6. modul - ... • X" → "6. modul"
const beforeEllipsis = (value = '') => value.split(/\s*[-•]?\s*(?:\.{3}|…)/)[0].replace(/\s*[-•]\s*$/, '').trim();

// Lessons with many holds/teachers (fællesarrangementer, ændrede moduler) are
// shortened on the brick to "6. modul - ... • ... • X" and lose their context
// cards and title. The tooltip, when there is one, still has everything.
function fillFromTooltip(lesson, tip) {
  const cut = shortened(lesson.module) || shortened(lesson.room);
  if (shortened(lesson.module)) lesson.module = beforeEllipsis(lesson.module);
  if (shortened(lesson.room)) lesson.room = '';
  if (!tip) return lesson;
  if (!lesson.title) lesson.title = tip.title;
  if (!lesson.holds.length && tip.fields.holds) lesson.holds = names(tip.fields.holds);
  if (!lesson.teachers.length && tip.fields.teachers) lesson.teachers = names(tip.fields.teachers);
  if (tip.fields.rooms && (cut || !lesson.room)) lesson.room = tip.fields.rooms;
  if (lesson.status === 'normal' && tip.status !== 'normal') lesson.status = tip.status;
  return lesson;
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
