// Stable, pleasant colour per subject/hold. Strips class prefixes ("3a Da" → "da")
// so every lesson of a subject shares a colour. The user can pick their own colour
// per subject (Settings → Udseende); those are applied as CSS variables, so every
// subjectColor() call picks them up without re-rendering.
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
