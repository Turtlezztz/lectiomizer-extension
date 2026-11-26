// Renders the assistant's Markdown as React elements. No HTML passes through
// and images are never loaded, so a reply can't make the browser request
// anything by itself. Lectio links open inside Lectiomizer when there is a
// view for them, otherwise the original page in a new tab.
import { Fragment, createElement, type ReactNode } from 'react';
import { appRoute } from '@/lib/lectio/paths';
import { INLINE, parseBlocks } from './markdown-blocks.js';

export function resolveLink(value: string, base: string): { href: string; external: boolean } | null {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return null;
  const route = appRoute(url.href);
  if (route) return { href: `#${route}`, external: false };
  return { href: url.href, external: true };
}

interface Ctx {
  base: string;
}

function lineBreaks(text: string, key: () => string): ReactNode[] {
  return text.split('\n').flatMap((piece, i) => (i ? [<br key={key()} />, piece] : [piece]));
}

function anchor(href: string, children: ReactNode, ctx: Ctx, key: string) {
  const link = resolveLink(href, ctx.base);
  if (!link) return <Fragment key={key}>{children}</Fragment>;
  return (
    <a key={key} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined}>
      {children}
    </a>
  );
}

function inline(text: string, ctx: Ctx, prefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  const key = () => `${prefix}${n++}`;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) out.push(...lineBreaks(text.slice(last, index), key));
    const [whole, , code, label, href, bold, bold2, strike, em, em2, bare] = match;
    if (code !== undefined) out.push(<code key={key()}>{code}</code>);
    else if (label !== undefined) out.push(anchor(href, inline(label, ctx, key()), ctx, key()));
    else if (whole.startsWith('![')) out.push(<Fragment key={key()}>{whole.match(/^!\[([^\]]*)\]/)?.[1]}</Fragment>);
    else if (bold !== undefined || bold2 !== undefined) out.push(<strong key={key()}>{inline(bold ?? bold2, ctx, key())}</strong>);
    else if (strike !== undefined) out.push(<s key={key()}>{inline(strike, ctx, key())}</s>);
    else if (em !== undefined || em2 !== undefined) out.push(<em key={key()}>{inline(em ?? em2, ctx, key())}</em>);
    else if (bare !== undefined) out.push(anchor(bare, bare, ctx, key()));
    last = index + whole.length;
  }
  if (last < text.length) out.push(...lineBreaks(text.slice(last), key));
  return out;
}

function block(b: any, ctx: Ctx, key: number | string): ReactNode {
  switch (b.type) {
    case 'heading':
      return createElement(`h${Math.min(6, b.level + 2)}`, { key }, inline(b.text, ctx));
    case 'paragraph':
      return <p key={key}>{inline(b.text, ctx)}</p>;
    case 'rule':
      return <hr key={key} className="my-3 border-border" />;
    case 'code':
      return (
        <pre key={key} className="my-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12.5px]">
          <code>{b.text}</code>
        </pre>
      );
    case 'quote':
      return <blockquote key={key}>{b.blocks.map((c: any, i: number) => block(c, ctx, i))}</blockquote>;
    case 'list': {
      const items = b.items.map((blocks: any[], i: number) => (
        <li key={i}>{blocks.length === 1 && blocks[0].type === 'paragraph' ? inline(blocks[0].text, ctx) : blocks.map((c, j) => block(c, ctx, j))}</li>
      ));
      return b.ordered ? (
        <ol key={key} start={b.start !== 1 ? b.start : undefined}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case 'table':
      return (
        <div key={key} className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabel">
          <table>
            <thead>
              <tr>{b.head.map((c: string, i: number) => <th key={i} className="bg-surface-2 text-left font-medium">{inline(c, ctx)}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((row: string[], i: number) => (
                <tr key={i}>{b.head.map((_: string, j: number) => <td key={j}>{inline(row[j] || '', ctx)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

/** `base` resolves relative links: the school's Lectio root. */
export function Markdown({ text, base, className }: { text: string; base: string; className?: string }) {
  return <div className={`prose-lectio ${className || ''}`}>{parseBlocks(text).map((b: any, i: number) => block(b, { base }, i))}</div>;
}
