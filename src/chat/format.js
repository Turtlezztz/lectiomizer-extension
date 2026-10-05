// Turns Lectio pages into compact Markdown for the chat model. Rebuilt pages
// go through their reader, so the model sees the same values as the views;
// every other page is converted from its HTML. Links are written relative to
// the school's Lectio address (e.g. "OpgaverElev.aspx") to save tokens.
import { text } from '../page-data.js';
import { pageKind, schoolBase } from '../lectio.js';
import { readHome } from '../readers/home.js';
import { readAssignments } from '../readers/assignments.js';
import { readAssignment } from '../readers/assignment.js';
import { readActivity } from '../readers/activity.js';
import { readGrades } from '../readers/grades.js';
import { readAbsence } from '../readers/absence.js';
import { readMessages } from '../readers/messages.js';
import { readSchedule } from '../readers/schedule.js';
import { nativeCells } from '../readers/util.js';

export const PAGE_LIMIT = 40000;

const day = new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });
const clock = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
const hm = date => clock.format(date).replace('.', ':');
export const formatDate = date => date ? `${day.format(date)} kl. ${hm(date)}` : '';

// "https://www.lectio.dk/lectio/123/OpgaverElev.aspx" → "OpgaverElev.aspx"
export function shortUrl(href, base) {
  if (!href) return '';
  try {
    const url = new URL(href, base);
    if (!/^https?:$/.test(url.protocol)) return '';
    const root = new URL(base);
    const prefix = root.origin + (schoolBase(root.href) || root.pathname.replace(/[^/]*$/, ''));
    return url.href.startsWith(prefix) ? url.href.slice(prefix.length) : url.href;
  } catch { return ''; }
}

const clean = value => (value || '').replace(/­/g, '').replace(/[ \t\r\f\v ]+/g, ' ');
const cell = value => clean(value).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
const link = (label, href, base) => {
  const url = shortUrl(href, base);
  const name = clean(label).trim();
  return url ? `[${name || url}](${url})` : name;
};

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'select', 'option', 'input', 'button', 'textarea', 'object', 'embed', 'link', 'meta', 'head']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'form', 'fieldset', 'figure', 'figcaption', 'details', 'summary', 'center', 'address', 'dl', 'dt', 'dd', 'caption', 'legend', 'label']);

function hidden(el) {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
  if (el.classList.contains('nodisplay') || el.classList.contains('ls-fonticon') || el.classList.contains('lec-context-menu') || el.id === 'lectiomizer-root') return true;
  // Lectio duplicates content for phones; keep the desktop copy.
  if (el.classList.contains('OnlyMobile') && el.parentElement?.querySelector(':scope > .OnlyDesktop')) return true;
  return /display\s*:\s*none|visibility\s*:\s*hidden/i.test(el.getAttribute('style') || '');
}

// A table with a heading row and data rows; layout tables are read as blocks.
function isDataTable(table) {
  const rows = Array.from(table.rows);
  if (rows.length < 2 || table.querySelector('table')) return false;
  const head = rows.find(row => row.cells.length > 1 && Array.from(row.cells).every(c => c.tagName === 'TH'));
  return !!head && rows.some(row => row !== head && row.cells.length > 1);
}

function tableMarkdown(table, base) {
  const rows = Array.from(table.rows).filter(row => !hidden(row)).map(row => nativeCells(row).filter(c => !hidden(c)));
  const width = Math.max(...rows.map(r => r.reduce((n, c) => n + (c.colSpan || 1), 0)));
  const lines = rows.map(cells => {
    const values = cells.flatMap(c => [cell(inline(c, base)), ...Array(Math.max(0, (c.colSpan || 1) - 1)).fill('')]);
    while (values.length < width) values.push('');
    return values;
  }).filter(values => values.some(Boolean));
  if (!lines.length) return '';
  const [head, ...body] = lines;
  return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => ' --- ').join('|') + '|', ...body.map(v => '| ' + v.join(' | ') + ' |')].join('\n');
}

function inline(node, base) {
  return Array.from(node.childNodes, child => render(child, base, { inline: true })).join('').replace(/\s+/g, ' ').trim();
}

function render(node, base, context = {}) {
  if (node.nodeType === 3) return clean(node.textContent);
  if (node.nodeType !== 1) return '';
  const tag = node.tagName.toLowerCase();
  if (SKIP.has(tag) || hidden(node)) return '';
  const children = () => Array.from(node.childNodes, child => render(child, base, context)).join('');
  if (tag === 'br') return context.inline ? ' ' : '\n';
  if (tag === 'img') return node.getAttribute('alt') ? `[billede: ${clean(node.getAttribute('alt')).trim()}]` : '';
  if (tag === 'iframe') { const src = shortUrl(node.getAttribute('src'), base); return src ? `[indlejret indhold](${src})` : ''; }
  if (tag === 'a') {
    const raw = node.getAttribute('href') || '';
    const label = inline(node, base);
    if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return label ? ` ${label} ` : '';
    return ` ${link(label || node.getAttribute('title') || '', new URL(raw, base).href, base)} `;
  }
  if (/^h[1-6]$/.test(tag)) {
    const title = inline(node, base);
    return title && !context.inline ? `\n\n${'#'.repeat(Math.min(6, Number(tag[1]) + 1))} ${title}\n\n` : ` ${title} `;
  }
  if (['strong', 'b'].includes(tag)) { const t = inline(node, base); return t ? ` **${t}** ` : ''; }
  if (['em', 'i'].includes(tag)) { const t = inline(node, base); return t ? ` *${t}* ` : ''; }
  if (context.inline) return ` ${children()} `;
  if (tag === 'hr') return '\n\n---\n\n';
  if (tag === 'pre') return `\n\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
  if (tag === 'blockquote') return '\n\n' + blocks(node, base).split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(node.children).filter(li => li.tagName === 'LI' && !hidden(li));
    return '\n\n' + items.map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${blocks(li, base).replace(/\n+/g, '\n  ')}`).join('\n') + '\n\n';
  }
  if (tag === 'li') return `\n- ${blocks(node, base)}\n`;
  if (tag === 'table') return isDataTable(node) ? `\n\n${tableMarkdown(node, base)}\n\n` : '\n' + Array.from(node.rows).filter(r => !hidden(r)).map(row => nativeCells(row).filter(c => !hidden(c)).map(c => blocks(c, base)).filter(Boolean).join(' · ')).filter(Boolean).join('\n') + '\n';
  if (tag === 'td' || tag === 'th') return ` ${children()} `;
  if (BLOCK.has(tag) || tag === 'tr' || tag === 'tbody' || tag === 'thead') return `\n${children()}\n`;
  return children();
}

function tidy(markdown) {
  return markdown
    .split('\n').map(line => line.replace(/[ \t]+/g, ' ').replace(/ +([.,;:!?)])/g, '$1').replace(/\( +/g, '(').trimEnd().replace(/^ (?=\S)/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function blocks(node, base) {
  return tidy(Array.from(node.childNodes, child => render(child, base)).join(''));
}

// Any element → Markdown.
export function htmlToMarkdown(node, base = node.ownerDocument?.baseURI) {
  return node ? blocks(node, base) : '';
}

const lessonLine = (lesson, base) => {
  const what = lesson.title || lesson.holds.join(', ') || 'Lektion';
  const parts = [lesson.date, lesson.module, lesson.title && lesson.holds.join(', '), lesson.teachers.length && `lærer ${lesson.teachers.join(', ')}`, lesson.room && `lokale ${lesson.room}`].filter(Boolean);
  const flags = [lesson.status === 'changed' && 'ÆNDRET', lesson.status === 'cancelled' && 'AFLYST', lesson.homework && 'har lektier', lesson.note && 'har note'].filter(Boolean);
  return `${lesson.href ? link(what, lesson.href, base) : what}${parts.length ? ' · ' + parts.join(' · ') : ''}${flags.length ? ` (${flags.join(', ')})` : ''}`;
};

function formatHome(data, base) {
  const out = ['## Skema'];
  for (const d of data.days) {
    out.push(`### ${d.label || 'Lektioner'}`);
    out.push(...d.lessons.map(l => `- ${l.time ? `${hm(l.time.start)}–${hm(l.time.end)} ` : ''}${lessonLine(l, base)}`));
  }
  const rows = (block, title) => {
    if (!block) return;
    out.push(`## ${block.title || title}${block.info ? ` (${block.info})` : ''}`);
    if (block.href) out.push(`Hele listen: ${link(block.title || title, block.href, base)}`);
    if (!block.rows.length) out.push('Ingen.');
    for (const r of block.rows) {
      const detail = clean(r.detail || '').trim();
      out.push(`- ${r.href ? link(r.text, r.href, base) : r.text}${r.sender ? ` · ${r.sender}` : ''}${r.due ? ` · ${formatDate(r.due)}` : r.dueText ? ` · ${r.dueText}` : ''}${r.important ? ' · vigtig' : ''}${detail && detail !== r.text ? `\n  ${detail.replace(/\n+/g, '\n  ')}` : ''}`);
    }
  };
  rows(data.registrations, 'Fravær uden årsag');
  rows(data.assignments, 'Opgaver');
  rows(data.homework, 'Lektier');
  rows(data.messages, 'Beskeder');
  if (data.notices) {
    out.push(`## ${data.notices.title || 'Aktuelt'}`);
    for (const r of data.notices.rows) out.push(`- ${r.important ? '**Vigtig:** ' : ''}${htmlToMarkdown(r.node, base).replace(/\n+/g, '\n  ')}`);
  }
  for (const block of data.other) rows(block, block.title);
  if (data.groups.length) out.push('## Hold og grupper', data.groups.map(g => link(g.label, g.href, base)).join(', '));
  return out.join('\n');
}

function formatAssignments(data, base) {
  const out = [];
  if (data.filters.length) out.push(`Filtre: ${data.filters.map(f => `${f.label}: ${f.checked ? 'til' : 'fra'}`).join(', ')}`);
  if (!data.assignments.length) out.push(data.empty || 'Der er ingen opgaver.');
  out.push(...data.assignments.map(a => `- ${link(a.title, a.href, base)} · hold ${a.hold || '–'} · frist ${a.deadline ? formatDate(a.deadline) : a.deadlineText} · status ${a.status || '–'}${a.studentTime ? ` · elevtid ${a.studentTime}` : ''}${a.absence ? ` · fravær ${a.absence}` : ''}${a.awaiting ? ` · afventer ${a.awaiting}` : ''}${a.grade ? ` · karakter ${a.grade}` : ''}${a.note ? ` · note: ${a.note}` : ''}`));
  return out.join('\n');
}

function formatAssignment(data, base) {
  const out = [`## ${data.title}`];
  for (const [label, value] of Object.entries(data.info)) {
    if (label === 'Opgavetitel') continue;
    const links = value.links.map(l => link(l.label, l.href, base)).join(', ');
    out.push(`- **${label}:** ${links || value.text}`);
  }
  if (data.deadline) out.push(`- **Frist (tolket):** ${formatDate(data.deadline)}`);
  const docs = data.info.Opgavebeskrivelse?.links || [];
  if (docs.length) out.push('', '### Opgavebeskrivelsens dokumenter (læs dem med read_document)', ...docs.map(l => `- ${link(l.label, l.href, base)}`));
  if (data.students.length) {
    out.push('', '### Elever og status');
    for (const s of data.students) out.push(`- ${s.name}: ${[s.status, s.awaiting && `afventer ${s.awaiting}`, s.finished != null && (s.finished ? 'afsluttet' : 'ikke afsluttet'), s.grade && `karakter ${s.grade}`, s.gradeNote && `karakternote: ${s.gradeNote}`, s.studentNote && `elevnote: ${s.studentNote}`].filter(Boolean).join(' · ')}`);
  }
  if (data.group.length) out.push('', `Gruppe: ${data.group.join(', ')}`);
  out.push('', `### Indlæg (${data.entries.length})`);
  for (const e of data.entries) {
    out.push(`- ${e.time ? formatDate(e.time) : e.timeText} · ${e.user}`);
    const comment = e.comment ? htmlToMarkdown(e.comment, base) : '';
    if (comment) out.push('  ' + comment.replace(/\n+/g, '\n  '));
    for (const d of e.documents) out.push(`  Dokument: ${link(d.label || 'Dokument', d.href, base)}`);
  }
  out.push('', data.handIn ? 'Afleveringen er åben (eleven afleverer selv i Lectio).' : 'Afleveringen er lukket.');
  return out.join('\n');
}

function formatActivity(data, base) {
  const lesson = data.lesson;
  const out = [`## ${lesson ? lessonLine(lesson, base) : 'Lektion'}`];
  if (data.note) out.push('', `**Note til lektionen:** ${data.note}`);
  if (data.phases.length) out.push('', `Forløb: ${data.phases.map(p => link(p.label, p.href, base)).join(', ')}`);
  if (data.tabs.length > 1) out.push('', `Faner: ${data.tabs.map(t => t.current ? `${t.label} (vist)` : t.label).join(', ')}`);
  for (const section of data.sections) {
    out.push('', `### ${section.title || 'Indhold'}`);
    for (const item of section.items) out.push('', htmlToMarkdown(item.node, base));
  }
  if (!data.sections.length) out.push('', data.empty);
  if (data.extras.length) out.push('', '### Andet', ...data.extras.map(e => `- ${e.href ? link(e.label, e.href, base) : e.label}`));
  const nav = [data.previous && 'forrige', data.next && 'næste'].filter(Boolean);
  if (nav.length) out.push('', '(Forrige/næste lektion findes via skemaet.)');
  return out.join('\n');
}

function formatGrades(data) {
  const out = [];
  if (data.term) out.push(`Skoleår: ${data.term}`);
  out.push(...data.notices.map(n => `> ${n}`));
  out.push('', '## Karakterer i år');
  if (!data.current.subjects.length) out.push(data.current.empty || 'Ingen karakterer.');
  for (const s of data.current.subjects) {
    out.push(`### ${s.subject}${s.hold ? ` (${s.hold})` : ''}`);
    for (const f of s.forms) out.push(`- ${f.form || 'Karakter'}: ${f.grades.map(g => `${g.type} ${g.value}${g.final ? ' (endelig)' : ''}${g.weight ? `, vægt ${g.weight}` : ''}${g.extra.length ? ` (${g.extra.join(', ')})` : ''}`).join(' → ') || 'ingen'}`);
  }
  for (const d of data.diplomas) {
    if (d.error) { out.push('', `Et bevis kunne ikke læses: ${d.error}`); continue; }
    out.push('', `## Bevis: ${d.title}`);
    for (const a of d.averages) out.push(`- **${a.label}: ${a.value}**${a.note ? ` (${a.note})` : ''}`);
    for (const line of d.lines) {
      const results = line.results.filter(r => !r.empty).map(r => `${r.label}: ${Object.entries(r.fields).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      if (results.length) out.push(`- ${line.subject}: ${results.join('; ')}`);
    }
  }
  const table = (title, t) => {
    if (!t || t.error) return;
    if (!t.rows.length) return;
    out.push('', `## ${title}`, ...t.rows.map(row => `- ${Object.entries(row).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')}`));
  };
  table('Karakternoter', data.notes);
  table('Bemærkninger', data.remarks);
  table('Protokollinjer', data.protocol);
  return out.join('\n');
}

function formatAbsence(data, base) {
  const out = [];
  if (data.totals.length) out.push('## Samlet fravær', ...data.totals.map(t => `- ${t.label}: ${t.value}`));
  const rows = (title, table) => {
    if (!table) return;
    out.push('', `## ${title}`);
    if (!table.rows.length) out.push(table.empty || 'Ingen.');
    for (const r of table.rows) out.push(`- ${r.lesson ? lessonLine(r.lesson, base) : r.lessonText} · fravær ${r.amount || '–'}${r.registered ? ` · registreret ${r.registered}` : ''}${r.cause ? ` · årsag: ${r.cause}` : ' · mangler årsag'}${r.comment ? ` · ${r.comment}` : ''}${r.remark ? ` · bemærkning: ${r.remark}` : ''}${r.edit ? ` · ${link('angiv årsag', r.edit, base)}` : ''}`);
  };
  rows('Mangler fraværsårsag', data.missing);
  rows('Registreret fravær', data.history);
  return out.join('\n');
}

function formatMessages(data) {
  // An open thread only comes from a postback, never a fetched page; read it as plain markup.
  if (data.thread) return '';
  const out = [`Mappe: ${data.folder || 'Beskeder'}`];
  if (data.searchValue) out.push(`Søgning: ${data.searchValue}`);
  out.push(`Mapper: ${data.folders.map(f => f.label).join(', ')}`, '');
  if (!data.messages.length) out.push('Ingen beskeder i mappen.');
  out.push(...data.messages.map(m => `- ${m.unread ? '**ulæst** ' : ''}${m.subject} · fra ${m.sender}${m.starter && m.starter !== m.sender ? ` (startet af ${m.starter})` : ''} · ${m.changed}${m.attachment ? ' · vedhæftning' : ''}${m.flagged ? ' · flag' : ''}${m.recipients ? ` · til ${m.recipients}` : ''}`));
  out.push('', '(Selve beskedteksten åbnes kun inde i Lectio; den kan ikke hentes herfra.)');
  return out.join('\n');
}

export function formatLessons(lessons, base) {
  const byDay = new Map();
  for (const l of [...lessons].sort((a, b) => a.start.localeCompare(b.start))) {
    const key = l.start.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(l);
  }
  const out = [];
  for (const [date, list] of byDay) {
    const [y, m, d] = date.split('-').map(Number);
    out.push(`### ${new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d))}`);
    for (const l of list) {
      const what = l.title || l.holds.join(', ') || 'Lektion';
      const parts = [l.title && l.holds.join(', '), l.teachers.length && `lærer ${l.teachers.join(', ')}`, l.rooms.length && `lokale ${l.rooms.join(', ')}`].filter(Boolean);
      const status = l.status === 'cancelled' ? ' (AFLYST)' : l.status === 'changed' ? ' (ÆNDRET)' : '';
      out.push(`- ${l.start.slice(11)}–${l.end.slice(11)} ${l.href ? link(what, l.href, base) : what}${status}${parts.length ? ' · ' + parts.join(' · ') : ''}`);
      if (l.details) out.push('  ' + clean(l.details).trim().replace(/\n+/g, '\n  '));
    }
  }
  return out.join('\n') || 'Ingen lektioner i perioden.';
}

const formatters = {
  home: (doc, base) => formatHome(readHome(doc), base),
  assignments: (doc, base) => formatAssignments(readAssignments(doc), base),
  assignment: (doc, base) => formatAssignment(readAssignment(doc), base),
  activity: (doc, base) => formatActivity(readActivity(doc), base),
  grades: doc => formatGrades(readGrades(doc)),
  absence: (doc, base) => formatAbsence(readAbsence(doc), base),
  messages: doc => formatMessages(readMessages(doc)),
  schedule: (doc, base) => formatLessons(readSchedule(doc), base),
};

// "Eleven Demo Elev, 3a - Opgaver - Lectio" → "Opgaver", as the sidebar names pages.
export function pageTitle(doc) {
  const title = text(doc.querySelector('[id$="MainTitle"], #MainTitle')) || (doc.title || '').split(' - Lectio')[0];
  return title.split(/\s+-\s+/).pop().replace(/\s+/g, ' ').trim() || 'Lectio';
}

// A whole Lectio page → { title, markdown, truncated }.
export function formatPage(doc, url) {
  const base = doc.baseURI && doc.baseURI !== 'about:blank' ? doc.baseURI : url;
  const kind = pageKind(url);
  let body = '';
  if (formatters[kind]) {
    try { body = formatters[kind](doc, base); }
    catch (error) { body = ''; }
  }
  if (!body) {
    const root = doc.querySelector('#contenttable') || doc.querySelector('[id$="outerContentFrameDiv"]') || doc.body;
    // Lectio's own subnavigation (tabs) is useful context for finding related pages.
    const tabs = Array.from(doc.querySelectorAll('.ls-subnav2 a[href], .lectioTabToolbar a[href]')).filter(a => !/^(#|javascript:)/i.test(a.getAttribute('href'))).map(a => link(text(a), a.href, base));
    body = (tabs.length ? `Faner: ${tabs.join(', ')}\n\n` : '') + htmlToMarkdown(root, base);
  }
  const title = pageTitle(doc);
  let markdown = `# ${title}\nAdresse: ${shortUrl(url, base) || url}\n\n${body || '(Siden er tom.)'}`;
  const truncated = markdown.length > PAGE_LIMIT;
  if (truncated) markdown = markdown.slice(0, PAGE_LIMIT) + '\n\n[… siden er afkortet her]';
  return { title, markdown, truncated };
}
