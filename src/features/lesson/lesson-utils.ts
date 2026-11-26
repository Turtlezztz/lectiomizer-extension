// Shape of readActivity() output + helpers for the lesson page.
import { appRoute } from '@/lib/lectio/paths';

export interface ActivityLesson {
  href: string | null;
  date: string;
  module: string;
  room: string;
  status: 'normal' | 'changed' | 'cancelled';
  holds: string[];
  teachers: string[];
  title: string;
  homework: boolean;
  note: boolean;
}

export interface NavLinkData {
  source: Element;
  label: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  node: Element;
}

export interface ActivityData {
  lesson: ActivityLesson | null;
  back: NavLinkData | null;
  previous: NavLinkData | null;
  next: NavLinkData | null;
  hold: { source: Element; label: string; previous: NavLinkData | null; next: NavLinkData | null } | null;
  tabs: Array<{ label: string; current: boolean; source: Element }>;
  print: Array<{ label: string; source: Element }>;
  phases: Array<{ label: string; href: string }>;
  note: string;
  sections: Array<{ title: string; items: ActivityItem[] }>;
  empty: string;
  extras: Array<{ label: string; href: string | null }>;
}

export const activityPath = (absid: string) => `aktivitet/aktivitetforside2.aspx?absid=${encodeURIComponent(absid)}`;
export const feedbackPath = (absid: string) => `${activityPath(absid)}&lectab=elevindhold`;
/** In-app route of the dedicated writing page. */
export const feedbackWriteRoute = (absid: string) => `/lesson/${encodeURIComponent(absid)}/feedback/write`;

/** absid from a Lectio URL ("…aktivitetforside2.aspx?absid=123") or null. */
export function absidFromHref(href: string | null | undefined): string | null {
  const route = appRoute(href);
  const m = route?.match(/^\/lesson\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Which activity a (postback) response shows: its URL, else its form action. */
export function absidOf(doc: Document): string | null {
  const form = doc.querySelector('form#aspnetForm') || doc.forms[0];
  const action = form?.getAttribute('action');
  return absidFromHref(doc.URL) ?? (action ? absidFromHref(new URL(action, doc.URL).href) : null);
}

export interface Attachment {
  label: string;
  href: string;
  ext: string;
}

const FILE_EXT = /\.([a-z0-9]{2,5})(?:$|[?#])/i;

/**
 * An item that is nothing but a link (Lectio's "naked link" resources such as
 * an uploaded PDF) is shown as an attachment chip rather than a text block.
 */
export function asAttachment(node: Element): Attachment | null {
  const links = Array.from(node.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  if (links.length !== 1) return null;
  const link = links[0];
  const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
  const label = (link.textContent || '').replace(/\s+/g, ' ').trim();
  if (!label || text !== label || node.querySelector('img, table, ul, ol')) return null;
  const href = link.href;
  if (!/^https?:/.test(href)) return null;
  let ext = '';
  try {
    ext = new URL(href).pathname.match(FILE_EXT)?.[1]?.toLowerCase() ?? '';
  } catch {
    /* ignore */
  }
  return { label, href, ext: ext === 'aspx' ? '' : ext };
}

/** Is this link/button usable from outside Lectio (postback or real URL)? */
export function isActionable(el: Element | null | undefined, postbackTarget: (el: Element) => unknown): boolean {
  if (!el) return false;
  if (postbackTarget(el)) return true;
  const href = el.getAttribute('href') || '';
  return !!href && !href.startsWith('#') && !href.startsWith('javascript:');
}

// ---------------------------------------------------------------- elevfeedback (readFeedback() output)

export interface FeedbackEditorData {
  textarea: HTMLTextAreaElement;
  html: string;
  /** Postback event target of Lectio's save command. */
  target: string;
  dirtyName: string;
  hasBackup: boolean;
}

export interface FeedbackPaper {
  id: string;
  name: string;
  contextId: string;
  teacher: boolean;
  own: boolean;
  editor: FeedbackEditorData | null;
  items: Array<{ id: string; node: Element }>;
}

export interface FeedbackData {
  lesson: ActivityLesson | null;
  contentHref: string | null;
  open: boolean;
  canWrite: boolean;
  /** The own paper is an editor right now (Lectio's edit mode). */
  editing: boolean;
  /** Lectio's "Rediger" button: posts back to switch the page to edit mode. */
  editButton: Element | null;
  /** Context-card id of the signed-in student, e.g. "S123". */
  me: string;
  own: FeedbackPaper | null;
  teacher: FeedbackPaper[];
  others: FeedbackPaper[];
  roster: Array<{ name: string; contextId: string; entries: Array<{ title: string; anchor: string }> }>;
  hint: string;
}

/** Does the activity page offer an Elevfeedback tab? */
export const hasFeedbackTab = (data: Pick<ActivityData, 'tabs'>) => data.tabs.some((t) => /elevfeedback/i.test(t.label));
