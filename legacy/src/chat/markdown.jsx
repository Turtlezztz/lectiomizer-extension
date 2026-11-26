// Renders the assistant's Markdown as React elements: headings, lists,
// tables, quotes, code and links. No HTML passes through and images are never
// loaded, so a reply can't make the browser request anything by itself.
import React from 'react';
import { INLINE, parseBlocks } from './markdown.js';

export function safeHref(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function inline(text, ctx, keyPrefix = 'i') {
  const out = [];
  let last = 0;
  let n = 0;
  const key = () => `${keyPrefix}${n++}`;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(...lineBreaks(text.slice(last, match.index), key));
    const [whole, , code, label, href, bold, bold2, strike, em, em2, bare] = match;
    if (code !== undefined) out.push(<code key={key()}>{code}</code>);
    else if (label !== undefined) out.push(anchor(href, inline(label, ctx, key()), ctx, key()));
    else if (whole.startsWith('![')) out.push(<React.Fragment key={key()}>{whole.match(/^!\[([^\]]*)\]/)[1]}</React.Fragment>);
    else if (bold !== undefined || bold2 !== undefined) out.push(<strong key={key()}>{inline(bold ?? bold2, ctx, key())}</strong>);
    else if (strike !== undefined) out.push(<s key={key()}>{inline(strike, ctx, key())}</s>);
    else if (em !== undefined || em2 !== undefined) out.push(<em key={key()}>{inline(em ?? em2, ctx, key())}</em>);
    else if (bare !== undefined) out.push(anchor(bare, bare, ctx, key()));
    last = match.index + whole.length;
  }
  if (last < text.length) out.push(...lineBreaks(text.slice(last), key));
  return out;
}

function lineBreaks(text, key) {
  return text.split('\n').flatMap((piece, i) => i ? [<br key={key()} />, piece] : [piece]);
}

function anchor(href, children, ctx, key) {
  const url = safeHref(href, ctx.base);
  if (!url) return <React.Fragment key={key}>{children}</React.Fragment>;
  const external = url.origin !== new URL(ctx.base).origin;
  return <a key={key} href={url.href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{children}</a>;
}

function block(b, ctx, key) {
  switch (b.type) {
    case 'heading': return React.createElement(`h${Math.min(6, b.level + 2)}`, { key }, inline(b.text, ctx));
    case 'paragraph': return <p key={key}>{inline(b.text, ctx)}</p>;
    case 'rule': return <hr key={key} />;
    case 'code': return <pre key={key}><code>{b.text}</code></pre>;
    case 'quote': return <blockquote key={key}>{b.blocks.map((c, i) => block(c, ctx, i))}</blockquote>;
    case 'list': {
      const items = b.items.map((blocks, i) => <li key={i}>{blocks.length === 1 && blocks[0].type === 'paragraph' ? inline(blocks[0].text, ctx) : blocks.map((c, j) => block(c, ctx, j))}</li>);
      return b.ordered ? <ol key={key} start={b.start !== 1 ? b.start : undefined}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case 'table': return <div key={key} className="lx-md-table" tabIndex={0} role="region" aria-label="Tabel"><table>
      <thead><tr>{b.head.map((c, i) => <th key={i}>{inline(c, ctx)}</th>)}</tr></thead>
      <tbody>{b.rows.map((row, i) => <tr key={i}>{b.head.map((_, j) => <td key={j}>{inline(row[j] || '', ctx)}</td>)}</tr>)}</tbody>
    </table></div>;
    default: return null;
  }
}

// `base` resolves relative links: the school's Lectio address.
export function Markdown({ text, base, className = '' }) {
  const blocks = parseBlocks(text);
  return <div className={`lx-md ${className}`}>{blocks.map((b, i) => block(b, { base }, i))}</div>;
}
