import { useMemo } from 'react';
import { appRoute } from '@/lib/lectio/paths';
import { embedsIn } from './embeds';
import { LinkEmbeds } from './LinkEmbeds';

const ALLOWED = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'P', 'BR', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'SPAN', 'DIV', 'IMG', 'PRE', 'CODE', 'HR', 'SUB', 'SUP', 'S', 'STRIKE', 'DEL', 'U']);

/** Inline styles worth keeping from Lectio's editor: colours, alignment, indent. */
const STYLE = /^(color|background-color|text-align|margin-left)$/;
const STYLE_VALUE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+|\d{1,4}(\.\d+)?px)$/i;
function safeStyle(style: string | null): string {
  if (!style) return '';
  return style
    .split(';')
    .map((d) => d.split(':').map((x) => x.trim()))
    .filter(([k, v]) => k && v && STYLE.test(k.toLowerCase()) && STYLE_VALUE.test(v))
    .map(([k, v]) => `${k.toLowerCase()}: ${v}`)
    .join('; ');
}

/** Sanitise Lectio HTML (an Element from a fetched page) into safe markup. Links to known pages stay in-app. */
export function sanitize(node: Element | null | undefined): string {
  if (!node) return '';
  const out = document.createElement('div');
  const copy = (src: Node, dst: Node) => {
    for (const child of Array.from(src.childNodes)) {
      if (child.nodeType === 3) dst.appendChild(document.createTextNode(child.textContent || ''));
      else if (child.nodeType === 1) {
        const el = child as Element;
        if (!ALLOWED.has(el.tagName)) {
          if (!/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|INPUT|SELECT|BUTTON|TEXTAREA|FORM)$/.test(el.tagName)) copy(el, dst);
          continue;
        }
        const next = document.createElement(el.tagName);
        if (el.tagName === 'A') {
          const href = (el as HTMLAnchorElement).href;
          if (/^https?:/.test(href)) {
            const route = appRoute(href);
            next.setAttribute('href', route ? `#${route}` : href);
            if (!route) {
              next.setAttribute('target', '_blank');
              next.setAttribute('rel', 'noreferrer');
            }
          }
        }
        if (el.tagName === 'IMG') {
          const src = (el as HTMLImageElement).src;
          if (/^https?:/.test(src)) next.setAttribute('src', src);
          next.setAttribute('alt', el.getAttribute('alt') || '');
        }
        const style = safeStyle(el.getAttribute('style'));
        if (style) next.setAttribute('style', style);
        if (el.tagName === 'TD' || el.tagName === 'TH') for (const a of ['colspan', 'rowspan']) if (el.hasAttribute(a)) next.setAttribute(a, el.getAttribute(a)!);
        copy(el, next);
        dst.appendChild(next);
      }
    }
  };
  copy(node, out);
  return out.innerHTML;
}

/** `embeds` also shows the files, videos and pictures the text links to, under it. */
export function RichText({ node, html, className, embeds }: { node?: Element | null; html?: string; className?: string; embeds?: boolean }) {
  const markup = useMemo(() => {
    if (node) return sanitize(node);
    if (html) return sanitize(new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild);
    return '';
  }, [node, html]);
  const linked = useMemo(() => (embeds ? embedsIn(node) : []), [embeds, node]);
  const text = <div className={`prose-lectio ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: markup }} />;
  if (!linked.length) return text;
  return (
    <>
      {text}
      <LinkEmbeds embeds={linked} className="mt-2.5" />
    </>
  );
}
