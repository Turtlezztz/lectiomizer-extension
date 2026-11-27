// Pure logic for the student's own message helpers, kept in local storage only:
// drafts of unsent messages and replies, text templates and pinned threads.
import type { Thread } from './types';

// ------------------------------------------------------------ drafts

export interface Draft {
  subject?: string;
  body: string;
  /** Names of the recipients when the draft was saved (they are not restored, only mentioned). */
  to?: string[];
  at: number;
}
export type Drafts = Record<string, Draft>;

export const DRAFTS = 'message-drafts';
/** Drafts older than this are dropped when another draft is saved. */
export const DRAFT_MAX_AGE = 30 * 86_400_000;

export const composeDraftId = (to?: string | null) => `new:${to || ''}`;
export const replyDraftId = (threadId: string) => `reply:${threadId}`;

export const isEmptyDraft = (d: Pick<Draft, 'subject' | 'body'> | null | undefined) => !d || (!d.body.trim() && !(d.subject || '').trim());

/** Store or (when empty / null) remove one draft; old drafts are pruned on the way. */
export function putDraft(all: Drafts, id: string, draft: Omit<Draft, 'at'> | null, now = Date.now()): Drafts {
  const out: Drafts = {};
  for (const [k, v] of Object.entries(all || {})) if (k !== id && v && now - v.at < DRAFT_MAX_AGE) out[k] = v;
  if (draft && !isEmptyDraft(draft)) out[id] = { ...draft, at: now };
  return out;
}

// ------------------------------------------------------------ templates

export interface Template {
  id: string;
  name: string;
  body: string;
}

export const TEMPLATES = 'message-templates';

/** Add a template, replacing one with the same name (case-insensitive). Newest first. */
export function addTemplate(list: Template[], name: string, body: string, id = `t${Date.now().toString(36)}`): Template[] {
  const clean = name.trim();
  if (!clean || !body.trim()) return list;
  const same = (t: Template) => t.name.trim().toLocaleLowerCase('da') === clean.toLocaleLowerCase('da');
  return [{ id, name: clean, body }, ...(list || []).filter((t) => !same(t))];
}

export const removeTemplate = (list: Template[], id: string) => (list || []).filter((t) => t.id !== id);

/**
 * Put a template into the text being written: it replaces an empty field,
 * otherwise it goes in at the cursor (or the end), on lines of its own.
 */
export function insertTemplate(text: string, body: string, at = text.length): { text: string; cursor: number } {
  if (!text.trim()) return { text: body, cursor: body.length };
  const pos = Math.max(0, Math.min(at, text.length));
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const lead = before && !before.endsWith('\n') ? (before.endsWith('\n\n') ? '' : '\n\n') : '';
  const trail = after && !after.startsWith('\n') ? '\n\n' : '';
  const next = before + lead + body + trail + after;
  return { text: next, cursor: (before + lead + body).length };
}

// ------------------------------------------------------------ pins

export const PINS = 'message-pins';

/** Ids like "row3" only exist when Lectio gave no thread id, so they cannot be pinned. */
export const canPin = (threadId: string) => !!threadId && !/^row\d+$/.test(threadId) && threadId !== 'new';

export const togglePin = (pins: string[], id: string) => ((pins || []).includes(id) ? pins.filter((p) => p !== id) : [id, ...(pins || [])]);

/** Pinned threads first (in pin order), then the rest in Lectio's order. */
export function pinnedFirst<T extends { id: string }>(rows: T[], pins: string[]): { pinned: T[]; rest: T[] } {
  const order = new Map((pins || []).map((id, i) => [id, i]));
  const pinned = rows.filter((r) => order.has(r.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const rest = rows.filter((r) => !order.has(r.id));
  return { pinned, rest };
}

// ------------------------------------------------------------ search in cached threads

/** The thread id of a cached beskeder2.aspx?type=showthread&id=… page. */
export function threadIdFromUrl(url: string): string | null {
  return /[?&]type=showthread\b/i.test(url) ? (url.match(/[?&]id=([^&#]+)/)?.[1] ?? null) : null;
}

/** Everything searchable in an opened thread: its subject, people and message texts. */
export function threadText(thread: Pick<Thread, 'subject' | 'messages'>): string {
  return [thread.subject, ...thread.messages.flatMap((m) => [m.sender.full, m.title, m.content?.textContent || ''])].join(' ');
}
