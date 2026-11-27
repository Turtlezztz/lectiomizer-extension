// Stable, pleasant colour per subject/hold. Strips class prefixes ("3a Da" → "da")
// so every lesson of a subject shares a colour. The user can pick their own colour
// per subject (Settings → Udseende); those are applied as CSS variables, so every
// subjectColor() call picks them up without re-rendering.
import { useCallback, useMemo } from 'react';
import { useSettings } from './settings';

const PALETTE = [
  { bg: 'oklch(0.95 0.04 25)', fg: 'oklch(0.45 0.14 25)', bar: 'oklch(0.65 0.17 25)' },
  { bg: 'oklch(0.95 0.045 250)', fg: 'oklch(0.42 0.13 250)', bar: 'oklch(0.62 0.15 250)' },
  { bg: 'oklch(0.95 0.05 155)', fg: 'oklch(0.4 0.1 155)', bar: 'oklch(0.62 0.13 155)' },
  { bg: 'oklch(0.96 0.055 85)', fg: 'oklch(0.45 0.1 70)', bar: 'oklch(0.75 0.14 80)' },
  { bg: 'oklch(0.95 0.045 300)', fg: 'oklch(0.43 0.14 300)', bar: 'oklch(0.62 0.16 300)' },
  { bg: 'oklch(0.95 0.045 195)', fg: 'oklch(0.42 0.09 195)', bar: 'oklch(0.65 0.11 195)' },
  { bg: 'oklch(0.95 0.05 345)', fg: 'oklch(0.45 0.15 345)', bar: 'oklch(0.65 0.17 345)' },
  { bg: 'oklch(0.95 0.05 55)', fg: 'oklch(0.47 0.12 50)', bar: 'oklch(0.7 0.15 55)' },
];
// light-dark() follows the `color-scheme` set on .dark, so colours update with the
// theme without re-rendering.
const darkBg = (bar: string) => bar.replace(/oklch\(([\d.]+) ([\d.]+)/, 'oklch(0.32 0.06');
const themed = (p: { bg: string; fg: string; bar: string }) => ({
  bg: `light-dark(${p.bg}, ${darkBg(p.bar)})`,
  fg: `light-dark(${p.fg}, ${p.bg})`,
  bar: p.bar,
});

/** Colours the user can choose between, by id. Stored ids must stay stable. */
export const SUBJECT_COLOR_CHOICES: { id: string; label: string; hue: number; chroma: number }[] = [
  { id: 'red', label: 'Rød', hue: 25, chroma: 1 },
  { id: 'orange', label: 'Orange', hue: 55, chroma: 1 },
  { id: 'yellow', label: 'Gul', hue: 85, chroma: 1 },
  { id: 'lime', label: 'Lime', hue: 125, chroma: 1 },
  { id: 'green', label: 'Grøn', hue: 155, chroma: 1 },
  { id: 'teal', label: 'Turkis', hue: 195, chroma: 1 },
  { id: 'sky', label: 'Himmelblå', hue: 225, chroma: 1 },
  { id: 'blue', label: 'Blå', hue: 255, chroma: 1 },
  { id: 'indigo', label: 'Indigo', hue: 280, chroma: 1 },
  { id: 'purple', label: 'Lilla', hue: 305, chroma: 1 },
  { id: 'pink', label: 'Pink', hue: 345, chroma: 1 },
  { id: 'brown', label: 'Brun', hue: 50, chroma: 0.45 },
  { id: 'gray', label: 'Grå', hue: 260, chroma: 0.12 },
];

function choiceColors(id: string) {
  const c = SUBJECT_COLOR_CHOICES.find((x) => x.id === id);
  if (!c) return null;
  const { hue: h, chroma: k } = c;
  // Yellow needs a lighter bar to read as yellow rather than olive.
  const barL = h >= 70 && h <= 100 ? 0.75 : 0.64;
  return themed({
    bg: `oklch(0.95 ${(0.048 * k).toFixed(3)} ${h})`,
    fg: `oklch(0.43 ${(0.13 * k).toFixed(3)} ${h})`,
    bar: `oklch(${barL} ${(0.16 * k).toFixed(3)} ${h})`,
  });
}

export function subjectKey(hold = ''): string {
  const parts = hold.trim().split(/\s+/);
  return (parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '').toLowerCase();
}

function hash(key: string): number {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

const varName = (key: string, part: string) => `--subject-${(hash(key) >>> 0).toString(36)}-${part}`;

/** The automatic colour, ignoring any choice the user made. */
export function defaultSubjectColor(hold = '') {
  return themed(PALETTE[Math.abs(hash(subjectKey(hold))) % PALETTE.length]);
}

export function subjectColor(hold = '') {
  const key = subjectKey(hold);
  const d = defaultSubjectColor(hold);
  return {
    bg: `var(${varName(key, 'bg')}, ${d.bg})`,
    fg: `var(${varName(key, 'fg')}, ${d.fg})`,
    bar: `var(${varName(key, 'bar')}, ${d.bar})`,
  };
}

/** Subject key (see subjectKey) → colour choice id. */
export type SubjectColors = Record<string, string>;

/** Apply the user's colour choices as CSS variables on :root. */
export function applySubjectColors(choices: SubjectColors = {}) {
  let style = document.getElementById('subject-colors') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'subject-colors';
    document.head.append(style);
  }
  const decls: string[] = [];
  for (const [key, id] of Object.entries(choices)) {
    const c = choiceColors(id);
    if (!c) continue;
    for (const part of ['bg', 'fg', 'bar'] as const) decls.push(`${varName(key, part)}: ${c[part]};`);
  }
  style.textContent = decls.length ? `:root { ${decls.join(' ')} }` : '';
}

/** Preview colours for a choice id (for swatches). */
export function choicePreview(id: string) {
  return choiceColors(id)!;
}

// ---------------------------------------------------------------- own names and links per subject
// Stored in Settings next to subjectColors and keyed the same way (subjectKey), so
// "L3d MA" and "L3d Ma" share a name and links, just as they share a colour.

/** Subject key → the user's own display name ("ma" → "Matematik"). */
export type SubjectNames = Record<string, string>;

export interface SubjectLink {
  label: string;
  url: string;
}

/** Subject key → the user's own links (Systime, OneNote, Teams…). */
export type SubjectLinksMap = Record<string, SubjectLink[]>;

/** At most this many links per subject: they are shortcuts, not a bookmark manager. */
export const MAX_SUBJECT_LINKS = 6;

/** The user's own name for a hold, if any. */
export function customSubjectName(hold = '', names: SubjectNames = {}): string | null {
  const name = names[subjectKey(hold)]?.trim();
  return name || null;
}

/**
 * What to call a hold: the user's own name, else `fallback` (default: the hold
 * itself). Pass subjectName(hold) as fallback where a subject name is shown.
 */
export function subjectLabel(hold = '', names: SubjectNames = {}, fallback?: string): string {
  return customSubjectName(hold, names) ?? fallback ?? hold;
}

// The names currently in Settings, for code outside React (subjectName() in schedule/lessons.ts).
let activeNames: SubjectNames = {};
export function applySubjectNames(names: SubjectNames = {}) {
  activeNames = names;
}
/** The user's own name for a hold from the current settings, if any. */
export const activeSubjectName = (hold = '') => customSubjectName(hold, activeNames);

/** The user's own links for a hold (empty when none). */
export function subjectLinks(hold = '', links: SubjectLinksMap = {}): SubjectLink[] {
  return links[subjectKey(hold)] ?? [];
}

const KNOWN_LINKS: Array<[RegExp, string]> = [
  [/(^|\.)systime\.dk$/, 'Systime'],
  [/(^|\.)onenote\.(com|office\.com)$|^onenote\./, 'OneNote'],
  [/(^|\.)teams\.(microsoft|live)\.com$/, 'Teams'],
  [/(^|\.)sharepoint\.com$/, 'SharePoint'],
  [/(^|\.)docs\.google\.com$/, 'Google Docs'],
  [/(^|\.)drive\.google\.com$/, 'Google Drive'],
  [/(^|\.)classroom\.google\.com$/, 'Classroom'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)gyldendal\.dk$/, 'Gyldendal'],
  [/(^|\.)praxis\.dk$/, 'Praxis'],
  [/(^|\.)lectio\.dk$/, 'Lectio'],
];

/** A typed-in address as an http(s) URL ("systime.dk/x" → "https://systime.dk/x"), else null. */
export function normalizeLinkUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A short name for a link: known services by name, else the host without "www.". */
export function linkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return KNOWN_LINKS.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return url;
  }
}

/** A new link from what the user typed, or null when the address isn't usable. */
export function makeSubjectLink(urlInput: string, labelInput = ''): SubjectLink | null {
  const url = normalizeLinkUrl(urlInput);
  if (!url) return null;
  return { url, label: labelInput.trim().slice(0, 40) || linkLabel(url) };
}

/** Copy of a per-subject map with `key` set, or removed when the value is empty. */
export function withSubjectValue<T>(map: Record<string, T> | undefined, key: string, value: T | null | undefined): Record<string, T> {
  const next = { ...(map ?? {}) };
  const empty = value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
  if (empty) delete next[key];
  else next[key] = typeof value === 'string' ? (value.trim() as T) : value;
  return next;
}

/** `(hold, fallback?) => label` with the user's own subject names. */
export function useSubjectLabel(): (hold: string, fallback?: string) => string {
  const names = useSettings().settings.subjectNames;
  return useCallback((hold: string, fallback?: string) => subjectLabel(hold, names, fallback), [names]);
}

/** The user's own links for a hold. */
export function useSubjectLinks(hold: string): SubjectLink[] {
  const links = useSettings().settings.subjectLinks;
  return useMemo(() => subjectLinks(hold, links), [hold, links]);
}
