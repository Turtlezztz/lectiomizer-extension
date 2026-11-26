// Reads ElevAflevering.aspx: assignment details, who hands in, the group, the
// entry timeline and the native hand-in controls.
import { text } from '../page-data.js';
import { schoolBase } from '../lectio.js';
import { ReaderError, iconLink, nativeCells, headerRow, parseLectioDate, readRows } from './util.js';
import { cardId } from './thread.js';

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

// A group hand-in has a Gruppeaflevering island: the members (each with Lectio's
// remove button, except the student themselves) and, while the group can still
// change, a list of classmates and Lectio's Tilføj button. Only on group assignments.
function readGroup(doc) {
  const table = doc.querySelector('[id$="groupMembersGV"]');
  if (!table) return null;
  // The student whose page this is; "Afleveres af" lists them too.
  const student = new URL(doc.URL).searchParams.get('elevid');
  const me = student ? `S${student}` : cardId(doc.querySelector('[id$="StudentGV"] [data-lectiocontextcard]'));
  const members = Array.from(table.rows).flatMap(row => {
    const card = row.querySelector('[data-lectiocontextcard]');
    const full = text(card || row.querySelector('li'));
    if (!full) return [];
    // "Anna Andersen, 3a 01"
    const [, name = full, className = ''] = full.match(/^(.*),\s*([^,]+)$/) || [];
    const id = cardId(card);
    const remove = Array.from(row.querySelectorAll('a')).find(a => /__doPostBack/.test(a.getAttribute('onclick') || a.getAttribute('href') || '')) || null;
    return [{ id, full, name, className, me: !!me && id === me, remove }];
  });
  const select = doc.querySelector('select[id$="groupStudentAddDD"]');
  const button = doc.querySelector('[id$="groupStudentAddBtn"]');
  return {
    members,
    add: select && button ? {
      select, button,
      // "Anna Andersen (3a 01)"
      options: Array.from(select.options).filter(o => o.value).map(o => ({ value: o.value, label: text(o) })),
    } : null,
  };
}

/**
 * Lectio's "Vælg dokument og send" control. There is no <input type=file>: the
 * browser uploads to dokumentupload.aspx first, writes the returned id as JSON
 * into the hidden `…$selectedDocumentId` field and posts back with the control's
 * UniqueID as event target and "documentId" as argument.
 */
export function readDocumentChooser(scope) {
  const field = scope?.querySelector('input[name$="$selectedDocumentId"]');
  const name = field?.getAttribute('name');
  return name ? { field: name, target: name.replace(/\$selectedDocumentId$/, ''), argument: 'documentId' } : null;
}

export function readAssignment(doc) {
  const infoTable = doc.querySelector('[id$="registerAfl_pa"] .ls-std-table-inputlist') || doc.querySelector('.ls-elevaflevering-page .ls-std-table-inputlist');
  const info = readInfo(infoTable);
  if (!info.Opgavetitel) throw new ReaderError('Opgavens oplysninger blev ikke fundet');
  const form = doc.querySelector('[id$="ElectronicHandInPanel"]');
  const school = schoolBase(doc.URL);
  return {
    title: info.Opgavetitel.text,
    info,
    deadline: parseLectioDate(info.Afleveringsfrist?.text),
    back: iconLink(doc.querySelector('#contenttable'), 'arrow_back'),
    group: readGroup(doc),
    students: readStudents(doc.querySelector('[id$="StudentGV"]')),
    entries: readEntries(doc.querySelector('[id$="RecipientGV"]')),
    base: school ? new URL(school, doc.URL).href : null,
    handIn: form ? {
      comment: form.querySelector('textarea'),
      send: form.querySelector('[id$="AddEntryBtn"]'),
      upload: form.querySelector('[id$="choosedocBtn"]'),
      chooser: readDocumentChooser(form),
      chosen: text(form.querySelector('[id$="DocumentNameTxt"]')),
    } : null,
  };
}
