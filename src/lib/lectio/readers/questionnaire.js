// Spørgeskemaer: the overview (spoergeskema/spoergeskema_rapport.aspx) and the
// answer page (spoergeskema/spoergeskema_besvar.aspx?id=…).
//
// Lectio has four question types: Overskrift (a section heading with text),
// Åbent svar (a textarea), Ét svar (a radio list) and Flere svar (checkboxes).
// Answering posts the page back with "Gem" (a draft only the student sees) or
// "Indsend" (final: the owner sees it and it can no longer be changed).
import { text } from '../page-data.js';
import { ReaderError, parseLectioDate, readRows } from './util.js';

const idOf = href => {
  try { return new URL(href).searchParams.get('id'); } catch { return null; }
};

function rowsOf(doc, suffix) {
  const table = doc.querySelector(`table[id$="${suffix}"]`);
  return table ? readRows(table).rows : null;
}

const date = cell => {
  const value = text(cell);
  return { text: value, date: parseLectioDate(value) };
};

export function readQuestionnaires(doc) {
  const open = rowsOf(doc, 'SpørgeskemaerÅbneForSvarGV');
  if (!open) throw new ReaderError('Listen over spørgeskemaer blev ikke fundet');
  const reports = rowsOf(doc, 'SpørgeskemaerÅbneForRapporteringGV') || [];
  const own = rowsOf(doc, 'EgneSpørgeskemaerGV') || [];
  const linkIn = (cell, pattern) => Array.from(cell?.querySelectorAll('a[href]') || []).find(a => pattern.test(a.getAttribute('href')))?.href || null;
  const create = doc.querySelector('a[id$="opretBtn"][href]');
  return {
    open: open.map(({ cells }) => {
      const href = linkIn(cells.Titel, /spoergeskema_besvar\.aspx/i);
      const deadline = date(cells.Svarfrist);
      return {
        id: idOf(href), href, title: text(cells.Titel), owner: text(cells.Ejer),
        anonymous: /^ja$/i.test(text(cells.Anonym)), deadline: deadline.date, deadlineText: deadline.text,
      };
    }),
    reports: reports.map(({ cells }) => {
      const href = linkIn(cells.Titel, /spoergeskemarapportering\.aspx/i);
      return {
        id: idOf(href), href, title: text(cells.Titel), owner: text(cells.Ejer),
        deadline: date(cells.Svarfrist).date, releases: date(cells.Frigives).date, expires: date(cells['Udløber']).date,
      };
    }),
    own: own.map(({ row, cells }) => {
      // The edit link only lives in the (mobile) title cell; the desktop title links to the results.
      const edit = Array.from(row.querySelectorAll('a[href]')).find(a => /spoergeskema_rediger\.aspx/i.test(a.getAttribute('href')));
      const href = linkIn(cells.Titel, /spoergeskemarapportering\.aspx/i);
      return {
        id: idOf(href || edit?.href), title: text(cells.Titel), href, editHref: edit ? edit.href : null,
        deadline: date(cells.Svarfrist).date, releases: date(cells.Frigives).date, expires: date(cells['Udløber']).date,
      };
    }),
    createHref: create ? create.href : null,
  };
}

// "1.2 Hvor ofte …" → { number: "1.2", title: "Hvor ofte …" }
export function splitHeading(value) {
  const m = value.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/);
  return m ? { number: m[1], title: m[2] } : { number: '', title: value };
}

function readInfo(doc) {
  const info = {};
  for (const row of Array.from(doc.querySelectorAll('[id$="InfoTable"] tr'))) {
    const label = text(row.querySelector('th')).replace(/:$/, '').toLocaleLowerCase('da');
    const value = text(row.querySelector('td'));
    if (/^titel/.test(label)) info.title = value;
    else if (/^ejer/.test(label)) info.owner = value;
    else if (/^anonym/.test(label)) info.anonymous = /^ja$/i.test(value);
  }
  return info;
}

function labelFor(input) {
  const label = input.labels?.[0] || (input.nextElementSibling?.tagName === 'LABEL' ? input.nextElementSibling : null);
  return text(label?.querySelector('.questionnaireanswer') || label);
}

function readQuestion(row, index) {
  const heading = row.querySelector('h1, h2, h3, h4');
  const { number, title } = splitHeading(text(heading));
  const textNode = row.querySelector('.ls-questionnaire-question-text');
  const base = { key: `q${index}`, number, title, level: heading?.tagName === 'H2' ? 1 : 2, text: text(textNode) || textNode?.querySelector('img') ? textNode : null };

  const textarea = row.querySelector('textarea[name]');
  if (textarea) return { ...base, kind: 'text', name: textarea.getAttribute('name'), value: textarea.value ?? textarea.textContent ?? '' };

  const radios = Array.from(row.querySelectorAll('input[type="radio"][name]'));
  if (radios.length) {
    const checked = radios.find(r => r.hasAttribute('checked') || r.checked);
    return {
      ...base, kind: 'single', name: radios[0].getAttribute('name'),
      options: radios.map(r => ({ value: r.getAttribute('value') ?? '', label: labelFor(r) })),
      value: checked ? checked.getAttribute('value') ?? '' : null,
    };
  }

  const boxes = Array.from(row.querySelectorAll('input[type="checkbox"][name]'));
  if (boxes.length) {
    return {
      ...base, kind: 'multi',
      options: boxes.map(b => ({ name: b.getAttribute('name'), label: labelFor(b), checked: b.hasAttribute('checked') || !!b.checked })),
    };
  }

  // Unknown input types: say so instead of silently dropping the question.
  if (row.querySelector('input:not([type="hidden"]), select')) return { ...base, kind: 'unsupported' };
  return { ...base, kind: 'info' };
}

export function readQuestionnaire(doc) {
  const grid = doc.querySelector('table[id$="questionnairegv"]');
  if (!grid) throw new ReaderError('Spørgeskemaet blev ikke fundet');
  const rows = Array.from(grid.rows).filter(row => row.querySelector(':scope > td'));
  const submit = doc.querySelector('a[id$="answercompletebt"]');
  const save = doc.querySelector('a[id$="answerbt"]');
  const info = readInfo(doc);
  return {
    id: idOf(doc.URL),
    title: info.title || text(doc.querySelector('#MainTitle')).replace(/^Besvar spørgeskema\s*-\s*/i, ''),
    owner: info.owner || '',
    anonymous: !!info.anonymous,
    questions: rows.map((row, i) => readQuestion(row, i)),
    // Without Lectio's buttons the questionnaire can only be read (already sent, closed, or a template).
    actions: submit || save ? { submit, save } : null,
  };
}

/** True for a fetched page that is a Spørgeskema answer page. */
export function isAnswerPage(doc) {
  return /spoergeskema_besvar\.aspx/i.test(doc.URL) && !!doc.querySelector('table[id$="questionnairegv"]');
}
