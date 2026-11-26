// Lectio HTML → compact Markdown for a language model (ported from v1's
// chat/format.js). Links are written by `link(label, href)`, which the caller
// supplies, so the same conversion can write school-relative links for the
// in-app chat and absolute ones for MCP clients.
import { nativeCells } from '../lectio/readers/util.js';

const clean = (value) => (value || '').replace(/­/g, '').replace(/[ \t\r\f\v ]+/g, ' ');
const cell = (value) => clean(value).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'select', 'option', 'input', 'button', 'textarea', 'object', 'embed', 'link', 'meta', 'head']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'form', 'fieldset', 'figure', 'figcaption', 'details', 'summary', 'center', 'address', 'dl', 'dt', 'dd', 'caption', 'legend', 'label']);

function hidden(el) {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
  if (el.classList.contains('nodisplay') || el.classList.contains('ls-fonticon') || el.classList.contains('lec-context-menu')) return true;
  // Lectio duplicates content for phones; keep the desktop copy.
  if (el.classList.contains('OnlyMobile') && el.parentElement?.querySelector(':scope > .OnlyDesktop')) return true;
  return /display\s*:\s*none|visibility\s*:\s*hidden/i.test(el.getAttribute('style') || '');
}

// A table with a heading row and data rows; layout tables are read as blocks.
function isDataTable(table) {
  const rows = Array.from(table.rows);
  if (rows.length < 2 || table.querySelector('table')) return false;
  const head = rows.find((row) => row.cells.length > 1 && Array.from(row.cells).every((c) => c.tagName === 'TH'));
  return !!head && rows.some((row) => row !== head && row.cells.length > 1);
}

export function createConverter(link) {
  function tableMarkdown(table) {
    const rows = Array.from(table.rows).filter((row) => !hidden(row)).map((row) => nativeCells(row).filter((c) => !hidden(c)));
    const width = Math.max(...rows.map((r) => r.reduce((n, c) => n + (c.colSpan || 1), 0)));
    const lines = rows
      .map((cells) => {
        const values = cells.flatMap((c) => [cell(inline(c)), ...Array(Math.max(0, (c.colSpan || 1) - 1)).fill('')]);
        while (values.length < width) values.push('');
        return values;
      })
      .filter((values) => values.some(Boolean));
    if (!lines.length) return '';
    const [head, ...body] = lines;
    return ['| ' + head.join(' | ') + ' |', '|' + head.map(() => ' --- ').join('|') + '|', ...body.map((v) => '| ' + v.join(' | ') + ' |')].join('\n');
  }

  const inline = (node) => Array.from(node.childNodes, (child) => render(child, { inline: true })).join('').replace(/\s+/g, ' ').trim();

  function render(node, context = {}) {
    if (node.nodeType === 3) return clean(node.textContent);
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (SKIP.has(tag) || hidden(node)) return '';
    const children = () => Array.from(node.childNodes, (child) => render(child, context)).join('');
    if (tag === 'br') return context.inline ? ' ' : '\n';
    if (tag === 'img') return node.getAttribute('alt') ? `[billede: ${clean(node.getAttribute('alt')).trim()}]` : '';
    if (tag === 'iframe') {
      const src = node.getAttribute('src');
      return src ? ` ${link('indlejret indhold', new URL(src, node.ownerDocument.baseURI).href)} ` : '';
    }
    if (tag === 'a') {
      const raw = node.getAttribute('href') || '';
      const label = inline(node);
      if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return label ? ` ${label} ` : '';
      let href;
      try { href = new URL(raw, node.ownerDocument.baseURI).href; } catch { return label ? ` ${label} ` : ''; }
      return ` ${link(label || node.getAttribute('title') || '', href)} `;
    }
    if (/^h[1-6]$/.test(tag)) {
      const title = inline(node);
      return title && !context.inline ? `\n\n${'#'.repeat(Math.min(6, Number(tag[1]) + 1))} ${title}\n\n` : ` ${title} `;
    }
    if (tag === 'strong' || tag === 'b') { const t = inline(node); return t ? ` **${t}** ` : ''; }
    if (tag === 'em' || tag === 'i') { const t = inline(node); return t ? ` *${t}* ` : ''; }
    if (context.inline) return ` ${children()} `;
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'pre') return `\n\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
    if (tag === 'blockquote') return '\n\n' + blocks(node).split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.children).filter((li) => li.tagName === 'LI' && !hidden(li));
      return '\n\n' + items.map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${blocks(li).replace(/\n+/g, '\n  ')}`).join('\n') + '\n\n';
    }
    if (tag === 'li') return `\n- ${blocks(node)}\n`;
    if (tag === 'table') {
      if (isDataTable(node)) return `\n\n${tableMarkdown(node)}\n\n`;
      return '\n' + Array.from(node.rows).filter((r) => !hidden(r)).map((row) => nativeCells(row).filter((c) => !hidden(c)).map((c) => blocks(c)).filter(Boolean).join(' · ')).filter(Boolean).join('\n') + '\n';
    }
    if (tag === 'td' || tag === 'th') return ` ${children()} `;
    if (BLOCK.has(tag) || tag === 'tr' || tag === 'tbody' || tag === 'thead') return `\n${children()}\n`;
    return children();
  }

  const blocks = (node) => tidy(Array.from(node.childNodes, (child) => render(child)).join(''));

  /** Any element → Markdown ('' for none). */
  return (node) => (node ? blocks(node) : '');
}

export function tidy(markdown) {
  return markdown
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/ +([.,;:!?)])/g, '$1').replace(/\( +/g, '(').trimEnd().replace(/^ (?=\S)/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
