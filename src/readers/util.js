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
