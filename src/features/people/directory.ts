// Students, teachers and rooms from Lectio's FindSkema.aspx lists.
import { useQuery } from '@tanstack/react-query';
import { getPage } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { readDirectory } from '@/lib/lectio/readers/directory.js';

export type DirectoryKind = 'elev' | 'laerer' | 'lokale';

export interface DirectoryEntry {
  kind: DirectoryKind;
  id: string;
  /** Lectio's label, e.g. "Anna Andersen (3a 01)", "Lene Madsen (lm)", "A12 Fysik". */
  label: string;
  /** Display name without the class/initials suffix. */
  name: string;
  /** Class for students ("3a"), initials for teachers ("lm"), '' for rooms. */
  code: string;
  /** Student number in the class ("01"), when Lectio shows it. */
  number: string;
  href: string;
  /** Lowercased, accent-folded text to search in. */
  search: string;
}

interface RawItem {
  kind: string;
  id: string;
  label: string;
  href: string;
}

export const fold = (s: string) =>
  s
    .toLocaleLowerCase('da')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim();

/** "Anna Andersen (3a 01)" → name, class 3a, number 01; "Lene Madsen (lm)" → name, initials lm. */
export function parseEntry(raw: RawItem): DirectoryEntry {
  const kind = raw.kind as DirectoryKind;
  const label = raw.label.trim();
  let name = label;
  let code = '';
  let number = '';
  const m = label.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m && kind !== 'lokale') {
    name = m[1] || label;
    const inner = m[2].trim();
    if (kind === 'elev') {
      const parts = inner.match(/^(.*?)\s+(\d{1,3})$/);
      code = parts ? parts[1] : inner;
      number = parts ? parts[2] : '';
    } else code = inner;
  }
  return { kind, id: raw.id, label, name, code, number, href: raw.href, search: fold(`${label} ${name} ${code}`) };
}

/** Run `fn` over `items`, at most `limit` at a time (be gentle with Lectio). */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Shared limiter for many small Lectio reads (room schedules). */
export function limiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<R>(fn: () => Promise<R>): Promise<R> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

export const directoryPath = (kind: DirectoryKind) => `FindSkema.aspx?type=${kind}`;

export async function loadDirectory(school: string, kind: DirectoryKind): Promise<DirectoryEntry[]> {
  const first = await getPage(pageUrl(school, directoryPath(kind)));
  const { items, letters } = readDirectory(first) as { items: RawItem[]; letters: Array<{ href: string }> };
  const all = new Map<string, RawItem>();
  const add = (list: RawItem[]) => list.filter((i) => i.kind === kind).forEach((i) => all.has(i.id) || all.set(i.id, i));
  add(items);
  // Students (and at big schools teachers) are split by first letter.
  const rest = letters.map((l) => l.href).filter((href) => href !== first.URL);
  if (rest.length) {
    const pages = await pool(rest, 4, async (href) => (readDirectory(await getPage(href)) as { items: RawItem[] }).items);
    for (const p of pages) if (p.status === 'fulfilled') add(p.value);
    if (!all.size) {
      const failed = pages.find((p) => p.status === 'rejected') as PromiseRejectedResult | undefined;
      if (failed) throw failed.reason;
    }
  }
  return Array.from(all.values()).map(parseEntry);
}

export function useDirectory(kind: DirectoryKind) {
  const school = useSchoolId();
  return useQuery({
    queryKey: ['lectio-directory', school, kind],
    queryFn: () => loadDirectory(school, kind),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Every word must match; entries whose name starts with the first word first. */
export function searchEntries(entries: DirectoryEntry[], query: string): DirectoryEntry[] {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((e) => words.every((w) => e.search.includes(w)));
}

const collator = new Intl.Collator('da', { numeric: true, sensitivity: 'base' });
export const compareText = (a: string, b: string) => collator.compare(a, b);

/** Lectio lists "Fornavn Efternavn"; sorting by last name uses the final word. */
export const lastName = (name: string) => name.trim().split(/\s+/).pop() || name;

export type PeopleSort = 'first' | 'last' | 'code';
export function sortEntries(entries: DirectoryEntry[], sort: PeopleSort): DirectoryEntry[] {
  const list = [...entries];
  if (sort === 'first') return list.sort((a, b) => compareText(a.name, b.name));
  if (sort === 'last') return list.sort((a, b) => compareText(lastName(a.name), lastName(b.name)) || compareText(a.name, b.name));
  return list.sort((a, b) => compareText(a.code, b.code) || compareText(a.number, b.number) || compareText(a.name, b.name));
}

/** Schedule path (relative to the school) for an entry. */
export function schedulePath(kind: DirectoryKind, id: string): string {
  if (kind === 'elev') return `SkemaNy.aspx?type=elev&elevid=${encodeURIComponent(id)}`;
  if (kind === 'laerer') return `SkemaNy.aspx?type=laerer&laererid=${encodeURIComponent(id)}`;
  return `SkemaNy.aspx?type=lokale&nosubnav=1&id=${encodeURIComponent(id)}`;
}

/** Lectio context card id: S… for students, T… for teachers. */
export const cardIdOf = (kind: DirectoryKind, id: string) => (kind === 'elev' ? `S${id}` : kind === 'laerer' ? `T${id}` : '');
