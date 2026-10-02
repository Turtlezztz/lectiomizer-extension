// Reads ElevAflevering.aspx: assignment details, who hands in, the entry
// timeline and the native hand-in controls.
import { text } from '../page-data.js';
import { ReaderError, iconLink, nativeCells, headerRow, parseLectioDate, readRows } from './util.js';

const label = cell => text(cell).replace(/:$/, '');
const links = node => Array.from(node?.querySelectorAll('a[href]') || []).filter(a => !a.getAttribute('href').startsWith('#') && !/^javascript:/i.test(a.getAttribute('href'))).map(a => ({ label: text(a), href: a.href }));

function readInfo(table) {
  const info = {};
  for (const row of Array.from(table?.rows || [])) {
    const head = row.querySelector('th');
    const cell = row.querySelector('td');
    if (!head || !cell) continue;
    const value = cell.querySelector('.ls-elevaflevering-value') || cell;
    info[label(head)] = { text: text(value), links: links(value) };
  }
  return info;
}

function readStudents(table) {
  if (!table) return [];
  const head = headerRow(table);
  if (!head) return [];
  const labels = nativeCells(head).map(cell => text(cell));
  return Array.from(table.rows).filter(row => row !== head && row.querySelector(':scope>td')).map(row => {
    const cells = nativeCells(row);
    const field = name => {
      const cell = cells[labels.indexOf(name)];
      return cell ? text(cell.querySelector('.ls-elevaflevering-field-value, .ls-elevaflevering-note-value') || cell) : '';
    };
    const finished = cells[labels.indexOf('Afsluttet')]?.querySelector('input[type=checkbox]');
    return {
      name: text(cells[labels.indexOf('Elev')]?.querySelector('[data-lectiocontextcard]') || cells[labels.indexOf('Elev')]),
      awaiting: field('Afventer'), status: field('Status - Fravær'), finished: finished ? finished.checked : null,
      grade: field('Karakter'), gradeNote: field('Karakternote'), studentNote: field('Elevnote'),
    };
  });
}

function readEntries(table) {
  if (!table) return [];
  const { rows } = readRows(table);
  return rows.map(({ cells }) => {
    const time = cells.Tidspunkt?.querySelector('[title]')?.getAttribute('title') || text(cells.Tidspunkt);
    const user = cells.Bruger?.querySelector('[data-lectiocontextcard]') || cells.Bruger;
    return {
      time: parseLectioDate(time), timeText: text(cells.Tidspunkt),
      user: text(user), userTitle: user?.getAttribute?.('title') || '',
      comment: cells['Indlæg'] || null, documents: links(cells.Dokument),
    };
  });
}

export function readAssignment(doc) {
  const infoTable = doc.querySelector('[id$="registerAfl_pa"] .ls-std-table-inputlist') || doc.querySelector('.ls-elevaflevering-page .ls-std-table-inputlist');
  const info = readInfo(infoTable);
  if (!info.Opgavetitel) throw new ReaderError('Opgavens oplysninger blev ikke fundet');
  const form = doc.querySelector('[id$="ElectronicHandInPanel"]');
  return {
    title: info.Opgavetitel.text,
    info,
    deadline: parseLectioDate(info.Afleveringsfrist?.text),
    back: iconLink(doc.querySelector('#contenttable'), 'arrow_back'),
    group: Array.from(doc.querySelectorAll('[id$="groupMembersGV"] li')).map(li => text(li)),
    students: readStudents(doc.querySelector('[id$="StudentGV"]')),
    entries: readEntries(doc.querySelector('[id$="RecipientGV"]')),
    handIn: form ? {
      comment: form.querySelector('textarea'),
      send: form.querySelector('[id$="AddEntryBtn"]'),
      upload: form.querySelector('[id$="choosedocBtn"]'),
      chosen: text(form.querySelector('[id$="DocumentNameTxt"]')),
    } : null,
  };
}
