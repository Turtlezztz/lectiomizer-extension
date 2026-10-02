// Reads OpgaverElev.aspx: the assignment list and its two native filters.
import { text } from '../page-data.js';
import { ReaderError, noRecordText, parseLectioDate, readRows } from './util.js';

export function statusKind(cell) {
  if (cell?.querySelector('.exercisemissing')) return 'missing';
  if (cell?.querySelector('.exercisewait')) return 'waiting';
  const value = text(cell).toLowerCase();
  if (/afleveret/.test(value)) return 'delivered';
  if (/mangler/.test(value)) return 'missing';
  if (/venter/.test(value)) return 'waiting';
  return 'other';
}

export function readAssignments(doc) {
  const table = doc.querySelector('[id$="ExerciseGV"]');
  if (!table) throw new ReaderError('Opgavelisten blev ikke fundet');
  const { labels, rows } = readRows(table);
  if (rows.length && !labels.includes('Opgavetitel')) throw new ReaderError('Opgavelisten mangler kolonnen "Opgavetitel"');
  const value = (cells, label) => text(cells[label]);
  return {
    filters: Array.from(doc.querySelectorAll('#printStudentAssignmentsArea input[type=checkbox]')).map(input => ({
      label: text(doc.querySelector(`label[for="${input.id}"]`)) || input.id, checked: input.checked, source: input,
    })),
    assignments: rows.map(({ cells }) => {
      const link = cells.Opgavetitel?.querySelector('a[href]');
      const deadline = cells.Frist?.querySelector('[title]')?.getAttribute('title') || value(cells, 'Frist');
      return {
        title: value(cells, 'Opgavetitel'), href: link ? link.href : null,
        hold: value(cells, 'Hold'), week: value(cells, 'Uge'),
        deadlineText: value(cells, 'Frist'), deadline: parseLectioDate(deadline),
        studentTime: value(cells, 'Elevtid'),
        status: value(cells, 'Status'), statusKind: statusKind(cells.Status),
        absence: value(cells, 'Fravær'), awaiting: value(cells, 'Afventer'),
        note: value(cells, 'Opgavenote'), grade: value(cells, 'Karakter'), studentNote: value(cells, 'Elevnote'),
      };
    }),
    empty: rows.length ? null : noRecordText(table) ?? 'Der er ingen opgaver',
  };
}
