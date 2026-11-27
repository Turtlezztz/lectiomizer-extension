// Eksamenspakke: one standalone HTML document with everything about a hold –
// the undervisningsbeskrivelse and its forløb, then every lesson's note,
// homework and other content – that links to the hold's files next to it
// ("filer/…" inside the same ZIP). Pure: strings in, a string out.
import { groupByMonth, type StudyEntry } from './study';

export interface PackField {
  label: string;
  /** Sanitised HTML. */
  html: string;
}

export interface PackDescription {
  subject: string;
  info: Array<{ label: string; text: string }>;
  phases: Array<{ id?: string; number: string; title: string; html: string; fields: PackField[] }>;
}

export interface PackInput {
  title: string;
  /** "2026/27" */
  term: string;
  description?: PackDescription | null;
  entries: StudyEntry[];
  /** File href → its path inside the ZIP ("filer/2026-09-14 Opgave.pdf"); files not in the map stay links to Lectio. */
  files: Map<string, string>;
  madeAt: Date;
}

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.55 -apple-system, "Segoe UI", Inter, Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 44px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #8884; }
  h3 { font-size: 16px; margin: 28px 0 6px; }
  h4 { font-size: 12px; margin: 14px 0 2px; text-transform: uppercase; letter-spacing: .04em; opacity: .65; }
  .muted { opacity: .65; font-size: 13px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 12px 0; }
  dt { opacity: .65; } dd { margin: 0; }
  nav ol { padding-left: 20px; } nav a { text-decoration: none; }
  article { margin: 0 0 18px; padding: 12px 0 0; border-top: 1px solid #8883; break-inside: avoid; }
  article header { font-weight: 600; }
  article header span { font-weight: 400; opacity: .65; margin-left: 6px; }
  .note { margin: 6px 0; padding: 6px 10px; border-left: 3px solid #e9a23b; background: #e9a23b1c; }
  ul.files { padding-left: 18px; margin: 6px 0; }
  img { max-width: 100%; height: auto; } table { border-collapse: collapse; } td, th { border: 1px solid #8884; padding: 3px 6px; }
  a { color: inherit; text-decoration-color: #8888; }
  @media print { body { max-width: none; padding: 0; } h2 { break-after: avoid; } }
`;

/** Sanitised blocks link into the app ("#/lesson/1"); outside the app those lead nowhere, so they become plain text. */
export const standalone = (html: string) => html.replace(/<a\b([^>]*?)\shref="#\/[^"]*"/g, '<a$1');

const pad = (n: number) => String(n).padStart(2, '0');
const dayText = (d: Date) => d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeText = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function lessonHtml(entry: StudyEntry, files: Map<string, string>): string {
  const { lesson, content } = entry;
  const title = content.title && !lesson.holds.includes(content.title) ? content.title : lesson.title;
  const where = [lesson.teachers.join(', '), lesson.rooms.join(', ')].filter(Boolean).join(' · ');
  const parts = [
    `<header>${escapeHtml(dayText(lesson.startDate))} ${timeText(lesson.startDate)}–${timeText(lesson.endDate)}${title ? ` · ${escapeHtml(title)}` : ''}${where ? `<span>${escapeHtml(where)}</span>` : ''}</header>`,
  ];
  if (content.note) parts.push(`<p class="note">${escapeHtml(content.note)}</p>`);
  for (const s of content.sections) parts.push(`<h4>${escapeHtml(s.title)}</h4>`, ...s.blocks.map((b) => `<div>${standalone(b)}</div>`));
  if (content.files.length) {
    parts.push(
      '<h4>Filer</h4>',
      `<ul class="files">${content.files
        .map((f) => {
          const local = files.get(f.href);
          // Encode each path segment, so names with spaces, # or ? still open from the folder.
          const href = local ? local.split('/').map(encodeURIComponent).join('/') : f.href;
          return `<li><a href="${escapeHtml(href)}">${escapeHtml(f.label)}</a>${local ? '' : ' <span class="muted">(link)</span>'}</li>`;
        })
        .join('')}</ul>`,
    );
  }
  return `<article>${parts.join('')}</article>`;
}

/** The whole reading document. */
export function packHtml({ title, term, description, entries, files, madeAt }: PackInput): string {
  const body: string[] = [`<h1>${escapeHtml(title)}</h1>`, `<p class="muted">Eksamenslæsning · ${escapeHtml(term)} · hentet fra Lectio ${escapeHtml(dayText(madeAt))}</p>`];
  const toc: string[] = [];
  if (description) {
    toc.push('<li><a href="#beskrivelse">Undervisningsbeskrivelse</a></li>');
    body.push('<h2 id="beskrivelse">Undervisningsbeskrivelse</h2>');
    const info = description.info.filter((f) => f.text);
    if (info.length) body.push(`<dl>${info.map((f) => `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.text)}</dd>`).join('')}</dl>`);
    if (description.phases.length) {
      toc.push(`<li><a href="#forloeb">Forløb</a><ol>${description.phases.map((p, i) => `<li><a href="#forloeb-${i + 1}">${escapeHtml(p.title)}</a></li>`).join('')}</ol></li>`);
      body.push('<h2 id="forloeb">Forløb</h2>');
      description.phases.forEach((p, i) => {
        body.push(`<h3 id="forloeb-${i + 1}">${escapeHtml([p.number, p.title].filter(Boolean).join('. '))}</h3>`);
        if (p.html) body.push(`<div>${standalone(p.html)}</div>`);
        for (const f of p.fields) if (f.html) body.push(`<h4>${escapeHtml(f.label)}</h4><div>${standalone(f.html)}</div>`);
      });
    }
  }
  if (entries.length) {
    toc.push('<li><a href="#lektioner">Lektioner: noter, lektier og filer</a></li>');
    body.push(`<h2 id="lektioner">Lektioner <span class="muted">· ${entries.length} med indhold</span></h2>`);
    for (const group of groupByMonth(entries)) {
      body.push(`<h3>${escapeHtml(group.label)}</h3>`, ...group.entries.map((e) => lessonHtml(e, files)));
    }
  }
  return `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} – eksamenslæsning</title><style>${CSS}</style></head>
<body>${body[0]}${body[1]}${toc.length > 1 ? `<nav><ol>${toc.join('')}</ol></nav>` : ''}${body.slice(2).join('\n')}</body></html>
`;
}
