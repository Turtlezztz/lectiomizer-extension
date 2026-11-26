// Converts between the HTML Lectio stores for an elevfeedback document and the
// HTML our contentEditable editor works with.
//
// Lectio keeps resource paths relative to the site ("/lectio/681/lc/…"); in
// the editor they must be absolute so images load from lectio.dk. On save we
// turn them back and keep only markup Lectio's own editor (CKEditor) allows,
// so the document still opens cleanly in Lectio.
import { ORIGIN } from '@/lib/lectio/client';

const BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
const INLINE = new Set(['STRONG', 'EM', 'S', 'SUB', 'SUP', 'SPAN', 'A', 'IMG', 'BR']);
const RENAME: Record<string, string> = { B: 'STRONG', I: 'EM', STRIKE: 'S', DEL: 'S', DIV: 'P', H4: 'H3', H5: 'H3', H6: 'H3', PRE: 'P', FONT: 'SPAN' };
const DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|INPUT|SELECT|BUTTON|TEXTAREA|FORM|META|LINK|TITLE|NOSCRIPT|SVG|VIDEO|AUDIO|CANVAS)$/;

/** Style properties CKEditor's toolbar in Lectio produces (colours, alignment, indent, table width). */
const STYLE_PROPS: Record<string, RegExp> = {
  color: /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i,
  'background-color': /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i,
  'text-align': /^(left|center|right|justify)$/,
  'margin-left': /^\d{1,4}(\.\d+)?px$/,
  width: /^\d{1,4}(\.\d+)?(px|%)$/,
};

export function cleanStyle(style: string | null, tag: string): string {
  if (!style) return '';
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim().replace(/\s*!important$/, '');
    const re = STYLE_PROPS[prop];
    if (!re || !re.test(value)) continue;
    if ((prop === 'text-align' || prop === 'margin-left') && !BLOCK.has(tag)) continue;
    if (prop === 'width' && tag !== 'TABLE') continue;
    if (prop === 'margin-left' && parseFloat(value) === 0) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

const lectioPrefix = `${ORIGIN}/lectio/`;
/** "https://www.lectio.dk/lectio/681/x" → "/lectio/681/x"; other URLs unchanged. */
export const toLectioPath = (url: string) => (url.startsWith(lectioPrefix) ? url.slice(ORIGIN.length) : url);
/** "/lectio/681/x" → "https://www.lectio.dk/lectio/681/x". */
export const toAbsolute = (url: string) => (url.startsWith('/') && !url.startsWith('//') ? ORIGIN + url : url);

type Mode = 'editor' | 'lectio';

function cleanTree(src: Node, dst: Node, doc: Document, mode: Mode) {
  for (const child of Array.from(src.childNodes)) {
    if (child.nodeType === 3) {
      dst.appendChild(doc.createTextNode(child.textContent || ''));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    if (DROP.test(el.tagName)) continue;
    let tag = RENAME[el.tagName] || el.tagName;
    // A <div> directly inside a list item or cell is layout noise: unwrap it.
    // So is one wrapping other blocks.
    if (el.tagName === 'DIV' && ((dst.nodeType === 1 && /^(LI|TD|TH|BLOCKQUOTE)$/.test((dst as Element).tagName)) || el.querySelector('p, h1, h2, h3, h4, ul, ol, table, blockquote, div'))) tag = '#unwrap';
    if (!BLOCK.has(tag) && !INLINE.has(tag)) {
      cleanTree(el, dst, doc, mode);
      continue;
    }
    const next = doc.createElement(tag);
    const style = cleanStyle(el.getAttribute('style'), tag);
    if (style) next.setAttribute('style', style);
    if (el.tagName === 'FONT' && el.getAttribute('color')) next.setAttribute('style', `color: ${el.getAttribute('color')}`);
    if (/^H[1-3]$/.test(tag) && el.id && /^\d+$/.test(el.id)) next.id = el.id; // Lectio's section ids
    if (tag === 'A') {
      const href = el.getAttribute('href') || '';
      if (!/^(https?:|\/|mailto:)/i.test(href)) {
        cleanTree(el, dst, doc, mode);
        continue;
      }
      next.setAttribute('href', mode === 'editor' ? toAbsolute(href) : toLectioPath(href));
      if (el.getAttribute('data-lc-display-linktype')) next.setAttribute('data-lc-display-linktype', el.getAttribute('data-lc-display-linktype')!);
    }
    if (tag === 'IMG') {
      const raw = el.getAttribute('src') || '';
      const ok = /^(https?:|\/)/i.test(raw) || (mode === 'editor' && /^blob:/.test(raw));
      if (!ok) continue;
      next.setAttribute('src', mode === 'editor' ? toAbsolute(raw) : toLectioPath(raw));
      next.setAttribute('alt', el.getAttribute('alt') || '');
      for (const a of ['width', 'height']) if (/^\d+$/.test(el.getAttribute(a) || '')) next.setAttribute(a, el.getAttribute(a)!);
    }
    if (tag === 'TABLE') for (const a of ['border', 'cellpadding', 'cellspacing']) if (/^\d+$/.test(el.getAttribute(a) || '')) next.setAttribute(a, el.getAttribute(a)!);
    if (tag === 'TD' || tag === 'TH') for (const a of ['colspan', 'rowspan']) if (/^\d+$/.test(el.getAttribute(a) || '')) next.setAttribute(a, el.getAttribute(a)!);
    cleanTree(el, next, doc, mode);
    // Spans without styling carry nothing.
    if (tag === 'SPAN' && !next.getAttribute('style')) {
      while (next.firstChild) dst.appendChild(next.firstChild);
      continue;
    }
    dst.appendChild(next);
  }
}

/** Loose inline content at the top level is wrapped in <p>, like CKEditor does. */
function wrapLooseInline(root: Element, doc: Document) {
  let para: HTMLElement | null = null;
  for (const node of Array.from(root.childNodes)) {
    const isBlock = node.nodeType === 1 && BLOCK.has((node as Element).tagName);
    if (isBlock) {
      para = null;
      continue;
    }
    if (node.nodeType === 3 && !node.textContent?.trim() && !para) {
      node.remove();
      continue;
    }
    if (!para) {
      para = doc.createElement('p');
      root.insertBefore(para, node);
    }
    para.appendChild(node);
  }
}

function convert(html: string, mode: Mode): string {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = parsed.createElement('div');
  cleanTree(parsed.body, out, parsed, mode);
  wrapLooseInline(out, parsed);
  // Trailing empty paragraphs (the editor leaves "<p><br></p>").
  while (out.lastElementChild && out.lastElementChild.tagName === 'P' && !out.lastElementChild.textContent?.replace(/ /g, '').trim() && !out.lastElementChild.querySelector('img')) {
    out.lastElementChild.remove();
  }
  return out.innerHTML;
}

/** Lectio document HTML → safe HTML for the editor (absolute resource URLs). */
export const toEditorHtml = (html: string) => convert(html, 'editor');

/** Editor HTML → what we post back to Lectio (site-relative resource URLs, CKEditor-compatible markup). */
export const toLectioHtml = (html: string) => convert(html, 'lectio');

/** True when the document has no visible content. */
export function isBlank(html: string): boolean {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return !doc.body.textContent?.replace(/ /g, '').trim() && !doc.body.querySelector('img, table, a[href]');
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Markup Lectio uses for an attached file link. */
export const fileLinkHtml = (url: string, name: string) => `<a href="${escapeHtml(toAbsolute(url))}" data-lc-display-linktype="file">${escapeHtml(name)}</a>&nbsp;`;

export const imageHtml = (url: string, width?: number, height?: number) =>
  `<img src="${escapeHtml(toAbsolute(url))}" alt=""${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''} />`;

export function tableHtml(rows: number, cols: number): string {
  const cell = '<td>&nbsp;</td>'.repeat(cols);
  return `<table border="1" cellpadding="1" cellspacing="1" style="width: 100%"><tbody>${`<tr>${cell}</tr>`.repeat(rows)}</tbody></table><p><br></p>`;
}
