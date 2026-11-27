// Reads studieplan.aspx?displaytype=ugeteksttabel (the "Studieplan - Kalender"
// table) and studieplan/forloeb_vis.aspx (one forløb).
//
// The calendar is one header row (a column group per hold, colspan = its
// columns) and one tall data row whose cells hold absolutely positioned
// .phase and .exercise boxes. The dates are only in the tooltips, so those are
// what we read; the pixel positions are ignored.
import { text } from '../page-data.js';
import { ReaderError, readLesson } from './util.js';
import { readSections } from './activity.js';

// "ma 23/11-26" → Date
function shortYearDate(value) {
  const m = (value || '').match(/(\d{1,2})\/(\d{1,2})-(\d{2,4})/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return new Date(year, +m[2] - 1, +m[1]);
}

// "Titel: Marketing\nEstimat: 8,00 moduler\nPeriode: ma 23/11-26 - fr 18/12-26"
function tooltipFields(tooltip = '') {
  const fields = {};
  for (const line of tooltip.split(/\r?\n/)) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (m) fields[m[1].trim().toLocaleLowerCase('da')] = m[2].trim();
  }
  return fields;
}

function readPhaseBox(link) {
  const tip = tooltipFields(link.getAttribute('data-tooltip') || '');
  const [from, to] = (tip.periode || '').split(/\s+-\s+/);
  const id = new URL(link.href).searchParams.get('phaseid') || '';
  return {
    id,
    title: tip.titel || text(link),
    href: link.href,
    estimate: tip.estimat || '',
    start: shortYearDate(from),
    end: shortYearDate(to),
  };
}

// "L23g eø\nBCG\nElevtid: 0 timer.\nAfleveringsfrist: U45 fr 06-11-2026 23:30\n"
// Exercises sharing a deadline share one box (one link each, "1,5 Opgave 1.").
function readExerciseBox(box) {
  const links = Array.from(box.querySelectorAll('a[href]'));
  if (links.length > 1) {
    const { deadline } = readExerciseLink(box, links[0]);
    return links.map(link => {
      const [, hours = '', title = ''] = text(link).match(/^([\d,.]+)?\s*(.*)$/) || [];
      return { title, href: link.href, deadline, studentHours: hours ? Number(hours.replace(',', '.')) : null };
    });
  }
  return [readExerciseLink(box, links[0] || null)];
}

function readExerciseLink(box, link) {
  const lines = (box.getAttribute('data-tooltip') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const deadline = lines.find(l => /^Afleveringsfrist:/i.test(l))?.match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  const time = lines.find(l => /^Elevtid:/i.test(l))?.match(/([\d,.]+)/)?.[1] || '';
  const title = lines.slice(1).filter(l => !/^(Elevtid|Afleveringsfrist):/i.test(l)).join(' ');
  return {
    title: title || text(link).replace(/^[\d,.]+\s*/, ''),
    href: link ? link.href : null,
    deadline: deadline ? new Date(+deadline[3], +deadline[2] - 1, +deadline[1], +(deadline[4] || 0), +(deadline[5] || 0)) : null,
    studentHours: time ? Number(time.replace(',', '.')) : null,
  };
}

export function readStudyPlan(doc) {
  const table = doc.querySelector('table[id$="spUge_theTable"]');
  if (!table) {
    if (!doc.querySelector('#contenttable')) throw new ReaderError('Studieplanen blev ikke fundet');
    return { holds: [] };
  }
  const [head, body, ...rest] = Array.from(table.rows);
  if (!head || !body) return { holds: [] };
  const holds = [];
  const owners = []; // hold per data cell (null for month/week/elevtid columns)
  for (const th of Array.from(head.cells)) {
    const link = th.querySelector('a[href]');
    const hold = link ? { id: new URL(link.href).searchParams.get('holdelementid') || '', name: text(link), href: link.href, phases: [], exercises: [], hours: null } : null;
    if (hold) holds.push(hold);
    for (let i = 0; i < (th.colSpan || 1); i++) owners.push(hold);
  }
  Array.from(body.cells).forEach((cell, i) => {
    const hold = owners[i];
    if (!hold) return;
    for (const link of Array.from(cell.querySelectorAll('.phase a[href]'))) hold.phases.push(readPhaseBox(link));
    for (const box of Array.from(cell.querySelectorAll('.exercise'))) hold.exercises.push(...readExerciseBox(box));
  });
  // "Elevtid" footer: "Total: 27 t." / "Norm: 24 t." per hold, in column order.
  const totals = rest.find(row => /elevtid/i.test(text(row.cells[0])));
  if (totals) {
    const cells = Array.from(totals.cells).filter(c => /total/i.test(text(c)));
    if (cells.length === holds.length) cells.forEach((c, i) => {
      const t = text(c);
      const num = re => { const m = t.match(re); return m ? Number(m[1].replace(',', '.')) : null; };
      holds[i].hours = { total: num(/Total:\s*([\d,.]+)/i), norm: num(/Norm:\s*([\d,.]+)/i) };
    });
  }
  for (const hold of holds) {
    hold.phases.sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity));
    hold.exercises.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
  }
  return { holds };
}

// Phase activities link aktivitetforside2.aspx?id=… (the activity, not the
// lesson). The brick's data-brikid ("ABS123") has the absid the app routes on.
function lessonHref(link) {
  const absid = (link.getAttribute('data-brikid') || '').match(/^ABS(\d+)/)?.[1];
  if (!absid) return link.href;
  const url = new URL(link.href);
  url.search = `?absid=${absid}`;
  return url.href;
}

export function readPhase(doc) {
  const overview = doc.querySelector('#phaseContent #overview') || doc.querySelector('#overview');
  if (!overview) throw new ReaderError('Forløbet blev ikke fundet');
  const title = text(overview.querySelector('.ls-section-title-heading')).replace(/^Forløb\s*-\s*/i, '');
  const fields = [];
  let exercises = [];
  const table = overview.querySelector('table');
  for (const row of Array.from(table?.rows || [])) {
    if (row.parentElement?.closest('table') !== table) continue;
    const th = row.querySelector(':scope > th');
    const td = row.querySelector(':scope > td');
    if (!th || !td) continue;
    const label = text(th).replace(/:$/, '');
    const grid = td.querySelector('table[id$="ExercisesGrid"]');
    if (grid) {
      exercises = Array.from(grid.rows).filter(r => r.querySelector('td') && !r.querySelector('.noRecord')).map(r => {
        const link = r.querySelector('a[href]');
        return { title: text(r.cells[0]), deadline: text(r.cells[1]), href: link ? link.href : null };
      });
      continue;
    }
    // Hold lists every school year the team has existed; keep "2026/27: L3d DA" lines apart.
    const lines = Array.from(td.querySelectorAll('[data-lectiocontextcard]')).map(el => text(el));
    const empty = !text(td);
    fields.push({ label, text: text(td), lines: label === 'Hold' ? lines : [], node: empty ? null : td });
  }
  const activities = Array.from(doc.querySelectorAll('[id$="_actContainer"] > .ls-phase-activity')).map(act => {
    const brick = act.querySelector('.ls-phase-activity-title a.s2skemabrik');
    const lesson = brick ? readLesson(brick) : null;
    if (lesson && brick) lesson.href = lessonHref(brick);
    const heading = act.querySelector('.ls-phase-activity-title .ls-section-title-heading');
    const note = heading ? text(heading.nextElementSibling) : '';
    const content = act.querySelector('.ls-phase-activity-content');
    const sections = content ? readSections(flatten(content)).filter(s => s.items.length) : [];
    return { id: act.id, lesson, title: lesson?.title || '', note, sections };
  });
  return { title, fields, exercises, activities };
}

// The activity content wraps each section ("Lektier", "Øvrigt indhold") in its
// own div; readSections expects headings and articles as siblings.
function flatten(content) {
  const out = content.ownerDocument.createElement('div');
  for (const group of Array.from(content.children)) {
    const parts = group.querySelector('.ls-section-subgroup-heading, article') ? Array.from(group.children) : [group];
    for (const part of parts) out.appendChild(part.cloneNode(true));
  }
  return out;
}
