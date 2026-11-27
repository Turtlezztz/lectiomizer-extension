// Reads grade_report.aspx into plain data. Columns are found by their headings
// and tables by Lectio's stable id suffixes, so layout changes fail loudly here
// instead of producing a half-styled page.
import { text } from '../page-data.js';
import { ReaderError, headerRow, nativeCells, noRecordText, optional, splitLines } from './util.js';

const HOLD = /^(hold|team)$/i;
const SUBJECT = /^(fag|subject)$/i;

// "XPRSFag: 6688A Dansk Kilde: Karakter Vægt: 1" (newline- or space-separated)
export function parseGradeTitle(title = '') {
  const s = title.replace(/\s+/g, ' ').trim();
  const pick = key => s.match(new RegExp(key + ':\\s*(.*?)(?=\\s+\\S+:|$)'))?.[1]?.trim() || null;
  return { xprs: pick('XPRSFag'), source: pick('Kilde'), weight: pick('Vægt') };
}

// "Dansk A, Skriftlig" → { subject: "Dansk A", form: "Skriftlig" }
export function splitSubject(label) {
  const i = label.lastIndexOf(',');
  return i < 0 ? { subject: label, form: '' } : { subject: label.slice(0, i).trim(), form: label.slice(i + 1).trim() };
}

function readGradeCell(cell, type) {
  const holder = cell.querySelector('div[title]') || cell;
  const [value, ...extra] = splitLines(holder);
  if (!value) return null;
  return { type, value, final: !!holder.querySelector('b'), extra, ...parseGradeTitle(holder.getAttribute('title') || '') };
}

export function readCurrentGrades(table) {
  const empty = noRecordText(table);
  const head = headerRow(table);
  if (!head) {
    if (empty !== null) return { types: [], subjects: [], empty };
    throw new ReaderError('Karaktertabellen har ingen overskrifter');
  }
  // "Afsluttende års-/<br> standpunktskarakter" → "Afsluttende års-/standpunktskarakter"
  const columns = nativeCells(head).map(cell => text(cell).replace(/\/\s+/g, '/'));
  const holdIndex = columns.findIndex(label => HOLD.test(label));
  const subjectIndex = columns.findIndex(label => SUBJECT.test(label));
  if (subjectIndex < 0) throw new ReaderError('Karaktertabellen mangler kolonnen "Fag"');
  const typeIndexes = columns.map((label, i) => i).filter(i => i !== holdIndex && i !== subjectIndex && columns[i]);
  const subjects = new Map();
  for (const row of Array.from(table.rows)) {
    if (row === head) continue;
    const cells = nativeCells(row);
    if (cells.length !== columns.length) continue;
    const hold = holdIndex < 0 ? '' : text(cells[holdIndex]);
    const { subject, form } = splitSubject(text(cells[subjectIndex]));
    const grades = typeIndexes.map(i => readGradeCell(cells[i], columns[i])).filter(Boolean);
    const key = subject + '|' + hold;
    if (!subjects.has(key)) subjects.set(key, { subject, hold, forms: [] });
    subjects.get(key).forms.push({ form, grades });
  }
  return { types: typeIndexes.map(i => columns[i]), subjects: Array.from(subjects.values()), empty: subjects.size ? null : empty ?? '' };
}

// Generic table with one heading row → { columns, rows: [{label: value}] }.
export function readRecordTable(table) {
  if (!table) return null;
  const head = headerRow(table);
  const columns = head ? nativeCells(head).map(cell => text(cell)) : [];
  const rows = [];
  for (const row of Array.from(table.rows)) {
    if (row === head) continue;
    const cells = nativeCells(row);
    if (!columns.length || cells.length !== columns.length) continue;
    rows.push(Object.fromEntries(columns.map((label, i) => [label, text(cells[i])])));
  }
  return { columns, rows, empty: rows.length ? null : noRecordText(table) ?? '' };
}

// "Eksamensresultat ekskl. bonus: 8,4 (baseret på …)" lines under a diploma.
export function readAverages(label) {
  if (!label) return [];
  return splitLines(label).map(line => line.match(/^(.*?):\s*([\d.,]+)\s*(?:\((.*)\))?$/)).filter(Boolean).map(([, name, value, note]) => ({ label: name.trim(), value, note: note?.trim() || null }));
}

export function readDiploma(island) {
  const title = text(island.closest('section')?.querySelector('.islandHeader')).replace(/^Bevistype:\s*/i, '');
  const table = island.querySelector('[id$="printareaDiplomaLines"] table') || island.querySelector('table');
  if (!table) throw new ReaderError('Beviset mangler sin tabel');
  const rows = Array.from(table.rows);
  const isHeading = row => Array.from(row.cells).some(cell => cell.tagName === 'TH');
  const top = rows[0] ? Array.from(rows[0].cells) : [];
  const bottom = rows[1] && isHeading(rows[1]) ? Array.from(rows[1].cells) : [];
  if (!bottom.length) throw new ReaderError('Beviset har ikke de forventede kolonnegrupper');
  // Two heading rows: "Fag" spans both; each group spans its sub-columns.
  const labels = [];
  let sub = 0;
  for (const cell of top) {
    const span = cell.colSpan || 1;
    if (cell.rowSpan > 1) { labels.push([text(cell), null]); continue; }
    for (let j = 0; j < span; j++) labels.push([text(cell), text(bottom[sub++])]);
  }
  const subjectIndex = labels.findIndex(([group, field]) => !field && SUBJECT.test(group));
  if (subjectIndex < 0) throw new ReaderError('Beviset mangler kolonnen "Fag"');
  const groups = [...new Set(labels.filter(([, field]) => field).map(([group]) => group))];
  // Newer Lectio adds an OnlyMobile cell with a nested table (and its own <th>s) to each row.
  const lines = rows.filter(row => !isHeading(row)).map(row => {
    const cells = nativeCells(row).map(cell => text(cell));
    const results = groups.map(group => {
      const fields = Object.fromEntries(labels.map(([g, field], i) => g === group && field ? [field, cells[i] === '-' ? null : cells[i]] : null).filter(Boolean));
      return { label: group, fields, empty: Object.values(fields).every(v => !v) };
    });
    return { subject: cells[subjectIndex], results };
  });
  return { title, groups, lines, averages: readAverages(island.querySelector('[id$="GradeAverageLabel"]')) };
}

export function readGrades(doc) {
  const current = doc.querySelector('[id$="karakterView_KarakterGV"]');
  if (!current) throw new ReaderError('Karaktertabellen blev ikke fundet');
  const term = doc.querySelector('[id$="ChooseTerm_term"]');
  return {
    term: term?.selectedOptions?.[0] ? text(term.selectedOptions[0]) : null,
    notices: Array.from(doc.querySelectorAll('[id$="ProtokolBlockLit"]')).map(el => text(el)).filter(Boolean),
    current: readCurrentGrades(current),
    notes: optional(() => readRecordTable(doc.querySelector('[id$="KarakterNoterGrid"]'))),
    remarks: optional(() => readRecordTable(doc.querySelector('[id$="remarks_grid_remarks_grid"]'))),
    diplomas: Array.from(doc.querySelectorAll('[id$="DiplomaGradesIsland_pa"]')).map(island => optional(() => readDiploma(island))),
    protocol: optional(() => readRecordTable(doc.querySelector('[id$="ProtokolLinierGrid"]'))),
  };
}
