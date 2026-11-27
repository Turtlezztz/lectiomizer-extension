// Pure helpers for the messages page: ids, paths, grouping and recipient search.
import { postbackTarget } from '@/lib/lectio/client';
import { fmtDate, fmtTime, fmtWeekday, dayDiff } from '@/lib/format';
import type { MessageRow, Recipient, ThreadMessage } from './types';

export const NEW_ID = 'new';

export const SIGNATURE_URL = 'https://github.com/Turtlezztz/lectiomizer-extension';
/** Lectio message bodies are BBCode, so the link is a [url] tag. */
export const SIGNATURE = `[url=${SIGNATURE_URL}]Sendt med Lectiomizer[/url]`;
export const withSignature = (body: string, on: boolean) => (on ? `${body.replace(/\s+$/, '')}\n\n${SIGNATURE}` : body);

/**
 * A list row's thread id. Lectio opens a thread with
 * `__doPostBack('__Page', '$LB2$_MC_$_<threadid>')`; the same id is the `id=`
 * of beskeder2.aspx thread links (see appRoute), so routes and links agree.
 */
export function threadIdOf(row: Pick<MessageRow, 'open'>, index: number): string {
  const argument = postbackTarget(row.open)?.argument || '';
  const id = argument.match(/_MC_\$_([\w-]+)$/)?.[1];
  return id || `row${index}`;
}

export const listPath = (folder?: string | null) => (folder ? `beskeder2.aspx?mappeid=${encodeURIComponent(folder)}` : 'beskeder2.aspx');
export const threadPath = (id: string) => `beskeder2.aspx?type=showthread&id=${encodeURIComponent(id)}`;
export const composePath = (to?: string | null) => `beskeder2.aspx?type=nybesked${to ? `&sendids=${encodeURIComponent(to)}` : ''}`;

/** Lower case without accents, so "Bjørn" is found by "bjorn" and "José" by "jose". */
export const fold = (value: string) => (value || '').toLocaleLowerCase('da').replace(/ø/g, 'o').replace(/æ/g, 'ae').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export function rowMatches(row: MessageRow, query: string): boolean {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = fold([row.subject, row.sender, row.starter, row.recipients, row.recipientsTitle].join(' '));
  return words.every((w) => hay.includes(w));
}

const capital = (s: string) => s.charAt(0).toLocaleUpperCase('da') + s.slice(1);

/** "I dag", "I går", "Tirsdag", "5. mar." (with year when not this year). */
export function dayLabel(date: Date, now = new Date()): string {
  const diff = dayDiff(date, now);
  if (diff === 0) return 'I dag';
  if (diff === -1) return 'I går';
  if (diff < -1 && diff > -7) return capital(fmtWeekday(date));
  const label = fmtDate(date);
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

export type ThreadItem =
  | { type: 'day'; key: string; label: string }
  | {
      type: 'run';
      key: string;
      own: boolean;
      senderKey: string;
      messages: ThreadMessage[];
    };

const HOUR = 3_600_000;
const senderKey = (m: ThreadMessage) => m.sender.id || m.sender.full;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Day separators, then runs of messages from one sender (a pause of an hour starts a new run). */
export function groupThread(messages: ThreadMessage[], now = new Date()): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastDay = '';
  messages.forEach((message, i) => {
    const previous = messages[i - 1];
    const day = message.date ? dayKey(message.date) : lastDay;
    if (message.date && day !== lastDay) {
      items.push({
        type: 'day',
        key: `d${i}`,
        label: dayLabel(message.date, now),
      });
      lastDay = day;
    }
    const last = items.at(-1);
    const paused = !!(previous?.date && message.date && message.date.getTime() - previous.date.getTime() >= HOUR);
    if (last?.type === 'run' && last.senderKey === senderKey(message) && !paused) last.messages.push(message);
    else
      items.push({
        type: 'run',
        key: `r${i}`,
        own: message.own,
        senderKey: senderKey(message),
        messages: [message],
      });
  });
  return items;
}

export const timeOf = (m: ThreadMessage) => (m.date ? fmtTime(m.date) : m.stamp);

/** Replies are titled "Re: <subject>"; only a title of its own is worth showing. */
export function ownTitle(title: string, subject: string): string {
  const strip = (s: string) =>
    s
      .trim()
      .toLocaleLowerCase('da')
      .replace(/^((re|sv|vs|fw|fwd):\s*)+/, '');
  return title.trim() && strip(title) !== strip(subject) ? title.trim() : '';
}

export const listNames = (names: string[]) =>
  names.length <= 3 ? names.join(', ').replace(/, ([^,]*)$/, ' og $1') : `${names.slice(0, 2).join(', ')} og ${names.length - 2} andre`;

/** Students, teachers and users have photos; classes and groups don't. */
export const hasPhoto = (id?: string) => /^[UST]\d+$/.test(id || '');

// ------------------------------------------------------------ recipients

// Lectio's recipient search loads its people, classes and groups from cached
// lists the page registers in a script, e.g.
// Autocomplete.registerDataSetUrl('bcstudent_1_y2026', '/lectio/94/cache/DropDown.aspx?type=bcstudent&…').
// parseDocument() strips scripts, so these are read from the raw HTML.
const DATASET = /registerDataSetUrl\(\s*['"](bc[a-z]+)_[^'"]*['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
export function sourcesFromHtml(html: string, base: string): Array<{ kind: string; url: string }> {
  const sources = new Map<string, string>();
  for (const [, kind, url] of html.matchAll(DATASET)) {
    if (!sources.has(kind)) sources.set(kind, new URL(url.replace(/&amp;/g, '&'), base).href);
  }
  return Array.from(sources, ([kind, url]) => ({ kind, url }));
}

const KINDS: Record<string, string> = {
  bcteacher: 'Lærer',
  bcstudent: 'Elev',
  bchold: 'Hold',
  bcgroup: 'Gruppe',
};

/** Lectio's DropDown.aspx JSON: items are [title, key, flags, group, cssClass, _, isContextCard, shortName, longName]. */
export function parseDirectory(json: string, kind: string): Recipient[] {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((item) => item?.[0] && item?.[1])
    .map(([title, key, , , , , , shortName, longName]) => ({
      key: String(key),
      title: String(title),
      kind: KINDS[kind] || '',
      search: fold([title, shortName, longName].filter(Boolean).join(' ')),
    }));
}

/** The best few matches: every word must match; names starting with the first word first. */
export function searchDirectory(items: Recipient[], query: string, skip: (item: Recipient) => boolean = () => false, limit = 8): Recipient[] {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const found: Array<{ item: Recipient; rank: number }> = [];
  for (const item of items) {
    if (!words.every((w) => item.search.includes(w)) || skip(item)) continue;
    const rank = item.search.startsWith(words[0]) ? 0 : item.search.split(' ').some((part) => part.startsWith(words[0])) ? 1 : 2;
    found.push({ item, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title, 'da'))
    .slice(0, limit)
    .map((f) => f.item);
}
