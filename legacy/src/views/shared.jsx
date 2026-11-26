import React from 'react';

// Clicks Lectio's own (hidden) control so postbacks, dialogs and hidden fields
// keep working. Plain links render as real links so they can open in new tabs.
export function Action({ source, href, className = '', title, children, disabled }) {
  const raw = source?.getAttribute?.('href') || '';
  const url = href ?? (source?.tagName === 'A' && raw && !raw.startsWith('#') && /^https?:/.test(source.href) ? source.href : null);
  const onClick = event => {
    if (!source) return;
    if (url && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    if (url && !source.hasAttribute('onclick')) return;
    event.preventDefault();
    if (source.isConnected) source.click();
  };
  if (url) return <a className={className} href={url} title={title} onClick={onClick}>{children}</a>;
  return <button type="button" className={className} title={title} disabled={disabled || !source} onClick={onClick}>{children}</button>;
}

const blocked = new Set(['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'noscript', 'template', 'link', 'meta']);
const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'hr', 'figure', 'figcaption', 'div', 'span', 'a', 'img', 'dl', 'dt', 'dd', 'mark', 'small']);
const headings = { h1: 'h3', h2: 'h4', h3: 'h5', h4: 'h6', h5: 'h6', h6: 'h6' };

export function safeUrl(value, base) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function convert(node, key) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (tag === 'iframe') {
    const src = safeUrl(node.getAttribute('src'), node.baseURI);
    return src ? <p key={key}><a href={src} target="_blank" rel="noopener noreferrer">Åbn indlejret indhold</a></p> : null;
  }
  if (blocked.has(tag) || node.hidden) return null;
  const children = Array.from(node.childNodes, (child, i) => convert(child, i));
  if (tag === 'img') {
    const src = safeUrl(node.getAttribute('src'), node.baseURI);
    return src ? <img key={key} src={src} alt={node.getAttribute('alt') || ''} loading="lazy" /> : null;
  }
  if (tag === 'br' || tag === 'hr') return React.createElement(tag, { key });
  if (tag === 'a') {
    const href = safeUrl(node.getAttribute('href'), node.baseURI);
    if (!href) return <React.Fragment key={key}>{children}</React.Fragment>;
    const external = new URL(href).origin !== new URL(node.baseURI).origin;
    return <a key={key} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{children}</a>;
  }
  if (headings[tag]) return React.createElement(headings[tag], { key }, ...children);
  if (!allowed.has(tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
  const props = { key };
  if (tag === 'td' || tag === 'th') {
    if (node.colSpan > 1) props.colSpan = node.colSpan;
    if (node.rowSpan > 1) props.rowSpan = node.rowSpan;
  }
  return React.createElement(tag, props, ...children);
}

// Renders Lectio-authored HTML (teacher notes, messages) as React elements:
// only an allowlist of tags, no attributes beyond safe links and images.
export function RichText({ node, className = '' }) {
  if (!node) return null;
  return <div className={`lx-rich ${className}`}>{Array.from(node.childNodes, (child, i) => convert(child, i))}</div>;
}

const dayFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
const relative = new Intl.RelativeTimeFormat('da', { numeric: 'auto' });

export function formatDeadline(date) {
  if (!date) return '';
  return `${dayFormat.format(date)} ${timeFormat.format(date)}`;
}

export function relativeDay(date, now = new Date()) {
  if (!date) return '';
  const start = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(date) - start(now)) / 86400000);
  return relative.format(days, 'day');
}

export function LessonMeta({ lesson }) {
  if (!lesson) return null;
  const parts = [lesson.date, lesson.module, ...lesson.holds, ...lesson.teachers, lesson.room].filter(Boolean);
  return <span className="lx-lesson-meta">{parts.join(' · ')}</span>;
}

export function Empty({ children }) {
  return <p className="lx-empty-state">{children}</p>;
}
