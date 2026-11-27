// Which links are worth showing as more than a link: files kept on Lectio
// (previewed like message attachments), YouTube videos, and addresses that
// point straight at a picture, a video or a sound file.
import { fileType } from '@/features/messages/files';

export type Embed =
  | { kind: 'file'; href: string; name: string }
  | { kind: 'youtube'; href: string; id: string; label: string }
  | { kind: 'image' | 'video' | 'audio'; href: string; name: string };

const LECTIO_HOST = /(^|\.)lectio\.dk$/i;
const LECTIO_FILE = /\/(dokumenthent|getfile|exercisefileget)\.aspx$|\/lc\/.+\.[a-z0-9]{2,5}$/i;

function baseName(url: URL): string {
  const last = url.pathname.split('/').pop() || '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m|music)\./, '').toLowerCase();
  let id: string | null | undefined;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/)?.[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** What a link can be shown as; null when it should stay just a link. */
export function embedFor(href: string, label = ''): Embed | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const text = label.replace(/\s+/g, ' ').trim();
  const fromPath = baseName(url);

  if (LECTIO_HOST.test(url.hostname)) {
    if (!LECTIO_FILE.test(url.pathname)) return null;
    // The link text is usually the file name; otherwise the address may end in one.
    if (fileType(text).kind !== 'other') return { kind: 'file', href: url.href, name: text };
    const type = fileType(fromPath);
    if (type.kind === 'other') return null;
    const named = text && text !== url.href ? `${text}.${type.ext}` : fromPath;
    return { kind: 'file', href: url.href, name: named };
  }

  const id = youtubeId(url);
  if (id) return { kind: 'youtube', href: url.href, id, label: text === url.href || /^https?:\/\//i.test(text) ? '' : text };

  const kind = fileType(fromPath).kind;
  if (kind === 'image' || kind === 'video' || kind === 'audio') return { kind, href: url.href, name: text && !/^https?:\/\//i.test(text) ? text : fromPath };
  return null;
}

/** The embeds for the links in a piece of Lectio content, each address once. */
export function embedsIn(node: Element | null | undefined, { max = 4, skip = [] as string[] } = {}): Embed[] {
  if (!node) return [];
  const seen = new Set(skip);
  const out: Embed[] = [];
  for (const link of Array.from(node.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    if (out.length >= max) break;
    // A linked picture is already on show.
    if (link.querySelector('img')) continue;
    const embed = embedFor(link.href, link.textContent || '');
    if (!embed) continue;
    const key = embed.kind === 'youtube' ? `yt:${embed.id}` : embed.href;
    if (seen.has(key) || seen.has(embed.href)) continue;
    seen.add(key);
    out.push(embed);
  }
  return out;
}
