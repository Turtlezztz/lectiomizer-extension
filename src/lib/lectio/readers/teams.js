// Hold (teams). Lectio lists them in two steps:
//   FindSkema.aspx?type=hold            one link per subject (…&fag=<id>), the
//                                       code in a .findskema-symbol span ("MA" Matematik)
//   FindSkema.aspx?type=hold&fag=<id>   the subject's holds under an <h4>, each a link to
//                                       SkemaNy.aspx?type=holdelement&holdelementid=<id>
// A hold's members are on subnav/members.aspx?holdelementid=…&showteachers=1&showstudents=1:
// one table row per teacher/student with photo, initials or "class nr", first and last name.
import { text } from '../page-data.js';

const listRoot = doc => doc.querySelector('[id$="listecontainer"]') || doc.querySelector('#contenttable, [id$="_Content"]') || doc.body;

function parse(href) {
  try { return new URL(href); } catch { return null; }
}

/** holdelementid of a SkemaNy.aspx?type=holdelement link, else null. */
export function teamId(href) {
  const url = parse(href);
  if (!url || !/\/skemany\.aspx$/i.test(url.pathname)) return null;
  const type = (url.searchParams.get('type') || '').toLowerCase();
  return type === 'holdelement' ? url.searchParams.get('holdelementid') : null;
}

/** The subjects on FindSkema.aspx?type=hold: [{ id, code, name, href }]. */
export function readTeamSubjects(doc) {
  const out = new Map();
  for (const a of listRoot(doc).querySelectorAll('a[href]')) {
    const url = parse(a.href);
    if (!url || !/\/findskema\.aspx$/i.test(url.pathname)) continue;
    const id = url.searchParams.get('fag');
    if (!id || (url.searchParams.get('type') || '').toLowerCase() !== 'hold' || out.has(id)) continue;
    const symbol = a.querySelector('.findskema-symbol');
    const code = text(symbol);
    const name = text({ textContent: Array.from(a.childNodes).filter(n => n !== symbol).map(n => n.textContent).join(' ') }) || code;
    out.set(id, { id, code, name, href: a.href });
  }
  return Array.from(out.values());
}

/** The holds on a subject's page: [{ id, name, href, heading }] (heading = the <h4> above it). */
export function readTeamList(doc) {
  const out = new Map();
  const root = listRoot(doc);
  let heading = '';
  // Walk headings and links in document order so each hold gets the heading above it.
  for (const el of root.querySelectorAll('h1, h2, h3, h4, h5, a[href]')) {
    if (el.tagName !== 'A') {
      heading = text(el);
      continue;
    }
    const id = teamId(el.href);
    const name = text(el);
    if (id && name && !out.has(id)) out.set(id, { id, name, href: el.href, heading });
  }
  return Array.from(out.values());
}

/** "Holdet L1a1 MA - Skema - Lectio - TEC" → "L1a1 MA". */
export function readTeamTitle(doc) {
  const heading = text(doc.querySelector('#s_m_HeaderContent_MainTitle, [id$="MainTitle"]'));
  const source = heading || doc.title || '';
  const m = source.match(/^\s*Holdet\s+(.+?)\s+-\s+/);
  return m ? m[1].trim() : '';
}

function personLink(row) {
  for (const a of row.querySelectorAll('a[href]')) {
    const url = parse(a.href);
    if (!url || !/\/skemany\.aspx$/i.test(url.pathname)) continue;
    const elev = url.searchParams.get('elevid');
    const laerer = url.searchParams.get('laererid');
    if (elev) return { kind: 'elev', id: elev, a };
    if (laerer) return { kind: 'laerer', id: laerer, a };
  }
  return null;
}

/**
 * Teachers and students of a hold: { title, teachers, students }, each
 * { kind, id, card, name, firstName, lastName, code, photo, line }.
 * `code` is the teacher's initials or the student's "class nr"; `line` the student's studieretning.
 */
export function readTeamMembers(doc) {
  const table = doc.querySelector('table[id$="laerereleverpanel_alm_gv"]') || doc.querySelector('table.lf-grid, table.ls-table-layout2');
  const teachers = [];
  const students = [];
  if (table) {
    const headers = Array.from(table.rows[0]?.cells || []).map(c => text(c).toLowerCase());
    const col = (re, fallback) => {
      const i = headers.findIndex(h => re.test(h));
      return i >= 0 ? i : fallback;
    };
    const cId = col(/^id$/, 2);
    const cFirst = col(/^fornavn$/, 3);
    const cLast = col(/^efternavn$/, 4);
    const cLine = col(/studieretning/, 5);
    const seen = new Set();
    for (const row of Array.from(table.rows).slice(1)) {
      const link = personLink(row);
      if (!link || seen.has(`${link.kind}:${link.id}`)) continue;
      seen.add(`${link.kind}:${link.id}`);
      const cells = row.cells;
      const firstName = text(cells[cFirst]) || text(link.a);
      const lastName = text(cells[cLast]);
      const img = row.querySelector('img[src*="GetImage" i]');
      const card = row.querySelector('[data-lectiocontextcard]')?.getAttribute('data-lectiocontextcard') || '';
      const member = {
        kind: link.kind,
        id: link.id,
        card,
        name: [firstName, lastName].filter(Boolean).join(' '),
        firstName,
        lastName,
        code: text(cells[cId]),
        photo: img ? img.src : null,
        line: link.kind === 'elev' ? text(cells[cLine]) : '',
      };
      (link.kind === 'laerer' ? teachers : students).push(member);
    }
  }
  return { title: readTeamTitle(doc), teachers, students };
}
