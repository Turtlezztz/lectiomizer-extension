// Reads subnav/fravaerelev_fravaersaarsager.aspx: totals, lessons missing an
// absence cause and the registration history.
import { text } from '../page-data.js';
import { ReaderError, noRecordText, readLesson, readRows, splitLines } from './util.js';

function readTable(table) {
  if (!table) return null;
  const { rows } = readRows(table);
  return {
    rows: rows.map(({ row, cells }) => {
      const registered = cells.Registreret;
      const cause = cells['FraværsårsagKommentar'] ? splitLines(cells['FraværsårsagKommentar']) : [];
      const edit = Array.from(row.querySelectorAll('a[href*="fravaer_aarsag"]')).find(a => a.closest('td.OnlyDesktop')) || row.querySelector('a[href*="fravaer_aarsag"]');
      return {
        week: text(cells.Uge),
        lesson: readLesson(cells.Aktivitet?.querySelector('a.s2skemabrik')),
        lessonText: text(cells.Aktivitet),
        amount: text(cells['Fravær']),
        registered: registered ? text(registered.querySelector('[title]') || registered) : '',
        registeredBy: registered ? Array.from(registered.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join(' ') : '',
        remark: text(cells['Bemærkning']),
        // Lectio writes a parenthesised placeholder such as "(Mangler årsag)" when none is given.
        cause: cause[0] && !/^\(.*\)$/.test(cause[0]) ? cause[0] : '',
        comment: cause.slice(1).join(' '),
        edit: edit ? edit.href : null,
      };
    }),
    empty: noRecordText(table),
  };
}

export function readAbsence(doc) {
  const missing = doc.querySelector('[id$="FatabMissingAarsagerGV"]');
  const history = doc.querySelector('[id$="FatabAbsenceFravaerGV"]');
  if (!missing && !history) throw new ReaderError('Fraværstabellerne blev ikke fundet');
  const summary = doc.querySelector('[id$="Samletfravaer_pa"]');
  const values = Array.from(summary?.querySelectorAll('.title-large') || []).map(el => text(el));
  const labels = Array.from(summary?.querySelectorAll('span:not(.title-large)') || []).map(el => text(el)).filter(Boolean);
  return {
    totals: values.map((value, i) => ({ value, label: labels[i] || '' })),
    missing: readTable(missing),
    history: readTable(history),
  };
}
