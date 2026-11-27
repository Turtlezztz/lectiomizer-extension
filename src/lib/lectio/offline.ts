// Offline-visning: the raw HTML of the student's most used Lectio pages is kept
// locally, so a page can be shown from its last good copy when Lectio cannot be
// reached. Reader output holds DOM handles and can't be stored, so the HTML is
// stored and parsed again on fallback. Only GET pages loaded via useLectioPage
// are saved, and only the student's own pages (see SAVABLE). The store is per
// school and is emptied when another student's pages start arriving.
import { LectioHttpError, NotLoggedInError, parseDocument } from './client';
import { extApi, getItem, isExtension, setItem } from '../storage';

export const LIMITS = {
  /** Pages kept per school. */
  entries: 30,
  /** Characters of HTML kept in total (storage.local has ~10 MB, localStorage 5 MB of UTF-16). */
  total: 2_500_000,
  /** A single page larger than this is not kept. */
  page: 600_000,
};

/** The student's own pages worth having offline (overview, schedule, homework, assignments, …). */
const SAVABLE: RegExp[] = [
  /\/forside\.aspx$/,
  /\/skemany\.aspx$/, // own schedule only: other people's/rooms' carry ?type= (checked below)
  /\/material_lektieoversigt\.aspx$/,
  /\/opgaverelev\.aspx$/,
  /\/elevaflevering\.aspx$/,
  /\/aktivitet\/aktivitetforside2?\.aspx$/,
  /\/fravaerelev_fravaersaarsager\.aspx$/,
  /\/grade_report\.aspx$/,
];

export function isSavable(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/(^|\.)lectio\.dk$/.test(u.hostname)) return false;
  const path = u.pathname.toLowerCase();
  if (/\/skemany\.aspx$/.test(path) && (u.searchParams.has('type') || u.searchParams.has('elevid') || u.searchParams.has('laererid'))) return false;
  return SAVABLE.some((re) => re.test(path));
}

/** Lectio could not be reached (network error, timeout, server down) – not "logged out" or a parse error. */
export function isUnreachable(error: unknown): boolean {
  if (!error || error instanceof NotLoggedInError) return false;
  if (error instanceof LectioHttpError) return error.status >= 500;
  const name = (error as Error).name;
  if (error instanceof TypeError || name === 'TypeError' || name === 'AbortError' || name === 'TimeoutError' || name === 'NetworkError') return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// ---------------------------------------------------------------- index (pure)

export interface SavedEntry {
  url: string;
  key: string;
  savedAt: number;
  size: number;
  hash: string;
}

export interface SavedIndex {
  owner: string | null;
  entries: SavedEntry[];
}

export const emptyIndex = (): SavedIndex => ({ owner: null, entries: [] });

/** Small stable hash (djb2) for storage keys and change detection. */
export function hash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Add/refresh an entry. Most recently saved first; the oldest are evicted
 * beyond the entry/size caps. A different owner (another student signed in)
 * starts over. Returns the new index, the storage keys to drop, and whether
 * the HTML itself must be (re)written.
 */
export function planSave(index: SavedIndex, entry: SavedEntry, owner: string | null, limits = LIMITS): { index: SavedIndex; drop: string[]; write: boolean } {
  const drop: string[] = [];
  let entries = index.entries;
  if (owner && index.owner && owner !== index.owner) {
    drop.push(...entries.map((e) => e.key));
    entries = [];
  }
  const previous = entries.find((e) => e.url === entry.url);
  const write = !previous || previous.hash !== entry.hash;
  const next = [entry, ...entries.filter((e) => e.url !== entry.url)];
  const kept: SavedEntry[] = [];
  let total = 0;
  for (const e of next) {
    if (kept.length < limits.entries && total + e.size <= limits.total) {
      kept.push(e);
      total += e.size;
    } else drop.push(e.key);
  }
  return { index: { owner: owner ?? index.owner, entries: kept }, drop, write: write && kept.includes(entry) };
}

// ---------------------------------------------------------------- serialising

/** The page as HTML without what offline reading doesn't need (view state is often the bulk). */
export function serialisePage(doc: Document): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  root.querySelectorAll('base').forEach((el) => el.remove()); // parseDocument adds it again
  root.querySelectorAll('input[name="__VIEWSTATE"], input[name="__EVENTVALIDATION"], input[name="__VIEWSTATEX"]').forEach((el) => el.setAttribute('value', ''));
  return `<!DOCTYPE html>${root.outerHTML}`;
}

// ---------------------------------------------------------------- storage

const indexKey = (school: string) => `offline-pages:${school}`;
const pageKey = (school: string, url: string) => `offline-page:${school}:${hash(url)}`;

async function removeItems(keys: string[]) {
  if (!keys.length) return;
  if (isExtension) return extApi.storage.local.remove(keys);
  try {
    for (const k of keys) localStorage.removeItem(`lx:${k}`);
  } catch {}
}

// Saves run one at a time so the index's read-modify-write never races.
let chain: Promise<unknown> = Promise.resolve();

/** Keep a successfully loaded page for offline use. Never throws. */
export function savePage(school: string, url: string, doc: Document, owner: string | null): Promise<void> {
  if (!isSavable(url)) return Promise.resolve();
  const run = async () => {
    const html = serialisePage(doc);
    if (html.length > LIMITS.page) return;
    const key = pageKey(school, url);
    const index = await getItem<SavedIndex>(indexKey(school), emptyIndex());
    const plan = planSave(index, { url, key, savedAt: Date.now(), size: html.length, hash: hash(html) }, owner);
    await removeItems(plan.drop);
    if (plan.write) await setItem(key, { url, html });
    await setItem(indexKey(school), plan.index);
  };
  const next = chain.then(run).catch(() => {});
  chain = next;
  return next;
}

/** The last good copy of a page, parsed again, or null. */
export async function loadSavedPage(school: string, url: string): Promise<{ doc: Document; savedAt: number } | null> {
  try {
    const index = await getItem<SavedIndex>(indexKey(school), emptyIndex());
    const entry = index.entries.find((e) => e.url === url);
    if (!entry) return null;
    const page = await getItem<{ url: string; html: string } | null>(entry.key, null);
    if (!page || page.url !== url) return null;
    return { doc: parseDocument(page.html, url), savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

/** Forget every saved page of a school (e.g. on sign-out or switching school). */
export async function clearSavedPages(school: string): Promise<void> {
  const index = await getItem<SavedIndex>(indexKey(school), emptyIndex());
  await removeItems([...index.entries.map((e) => e.key), indexKey(school)]);
}
