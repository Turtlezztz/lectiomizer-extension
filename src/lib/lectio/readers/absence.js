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
  // Lectio's own subnav link to the per-hold overview (fravaerelev.aspx), with whatever params it needs.
  const overview = Array.from(doc.querySelectorAll('a[href*="fravaerelev.aspx"]')).find(a => !/fravaersaarsager/i.test(a.getAttribute('href') || ''));
  return {
    totals: values.map((value, i) => ({ value, label: labels[i] || '' })),
    missing: readTable(missing),
    history: readTable(history),
    overview: overview ? overview.href : null,
  };
}

// --- subnav/fravaerelev.aspx: the counts behind the percentages --------------------
// One row per hold plus "Samlet". Columns are grouped under "Almindeligt fravær" and
// "Skriftligt fravær", each with "Periode" (the date range on the page, a month by
// default) and "Opgjort" (the school year so far). Without "Vis detaljer" Lectio only
// shows period modules, opgjort percent and opgjort elevtid; with it every group has
// both a "fravær/total" fraction and a percent:
//
//   Hold | Alm. Periode Moduler | Procent | Alm. Opgjort Moduler | Procent | Skr. Periode Elevtid | Procent | Skr. Opgjort Elevtid | Procent
//   L3d DA | 2/14 | 14,3% | 4/32 | 12,5% | 2/3 | 66,7% | 2/7 | 28,6%
//   Samlet | 4,5/108 | 4,2% | 65/363 | 17,9% | 2/23 | 8,7% | 2/73 | 2,7%

const FRACTION = /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/;
const PERCENT = /^(\d+(?:[.,]\d+)?)\s*%$/;
const toNumber = value => Number(String(value).replace(',', '.'));

// Heading text per column index, expanding colspan/rowspan of the heading rows.
export function columnLabels(table) {
  const labels = [];
  const taken = [];
  const heads = Array.from(table.rows).filter(row => row.cells.length && Array.from(row.cells).every(cell => cell.tagName === 'TH'));
  heads.forEach((row, r) => {
    let col = 0;
    for (const cell of Array.from(row.cells)) {
      while (taken[r]?.[col]) col++;
      const span = Math.max(1, cell.colSpan || 1);
      const down = Math.max(1, cell.rowSpan || 1);
      for (let c = col; c < col + span; c++) {
        labels[c] = [labels[c], text(cell)].filter(Boolean).join(' ');
        for (let k = 1; k < down; k++) (taken[r + k] ||= [])[c] = true;
      }
      col += span;
    }
  });
  return labels;
}

const emptyGroup = () => ({ absent: null, total: null, percent: null });
const emptyKind = () => ({ period: emptyGroup(), settled: emptyGroup() });

function readOverviewRow(row, labels) {
  const out = { regular: emptyKind(), written: emptyKind() };
  Array.from(row.cells).forEach((cell, i) => {
    if (i === 0) return;
    const label = labels[i] || '';
    const group = out[/skriftlig/i.test(label) ? 'written' : 'regular'][/opgjort/i.test(label) ? 'settled' : 'period'];
    const value = text(cell);
    const fraction = value.match(FRACTION);
    const percent = value.match(PERCENT);
    if (fraction) {
      group.absent = toNumber(fraction[1]);
      group.total = toNumber(fraction[2]);
    } else if (percent) group.percent = toNumber(percent[1]);
  });
  return out;
}

export function readAbsenceOverview(doc) {
  const table = doc.querySelector('[id$="StudentAbsenceDataTable"]')
    || Array.from(doc.querySelectorAll('table')).find(t => Array.from(t.rows).some(r => /^samlet/i.test(text(r.cells[0]))));
  if (!table) throw new ReaderError('Fraværsoversigten blev ikke fundet');
  const labels = columnLabels(table);
  const holds = [];
  let total = null;
  for (const row of Array.from(table.rows)) {
    const first = row.cells[0];
    if (!first || first.tagName === 'TH' || row.cells.length < 3) continue;
    const name = text(first);
    const values = readOverviewRow(row, labels);
    if (/^samlet/i.test(name)) total = values;
    else if (name) holds.push({ hold: name, href: first.querySelector('a')?.href || null, ...values });
  }
  if (!total) throw new ReaderError('Fraværsoversigten har ingen "Samlet"-række');
  // "Vis detaljer": a checkbox that posts back and adds the missing counts.
  const toggle = doc.querySelector('input[type="checkbox"][id$="UdvidCB"]');
  // The period's two date fields ("28/10-2026").
  const dates = Array.from(doc.querySelectorAll('input[type="text"]')).map(el => el.getAttribute('value') || '').filter(v => /^\d{1,2}\/\d{1,2}-\d{4}$/.test(v));
  const warnings = doc.querySelector('[id$="SFTabWarningGV"]');
  const remarks = warnings && !noRecordText(warnings)
    ? readRows(warnings).rows.map(({ cells }) => ({ date: text(cells.Dato), by: text(cells.Initialer), type: text(cells.Type), note: text(cells.Elevnote) })).filter(r => r.date || r.note)
    : [];
  return {
    holds,
    total,
    /** True when the module counts for "Opgjort" are on the page (Vis detaljer is on). */
    detailed: total.regular.settled.total !== null || holds.some(h => h.regular.settled.total !== null),
    detailToggle: toggle && !toggle.hasAttribute('checked') ? toggle : null,
    period: dates.length >= 2 ? { from: dates[0], to: dates[1] } : null,
    remarks,
  };
}
