// Stable, pleasant colour per subject/hold. Strips class prefixes ("3a Da" → "da")
// so every lesson of a subject shares a colour.
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
const DARK = PALETTE.map((p) => ({ bg: p.bar.replace(/oklch\(([\d.]+) ([\d.]+)/, 'oklch(0.32 0.06'), fg: p.bg }));

export function subjectKey(hold = ''): string {
  const parts = hold.trim().split(/\s+/);
  return (parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '').toLowerCase();
}

export function subjectColor(hold = '') {
  const key = subjectKey(hold);
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  const i = Math.abs(h) % PALETTE.length;
  return { bg: `light-dark(${PALETTE[i].bg}, ${DARK[i].bg})`, fg: `light-dark(${PALETTE[i].fg}, ${DARK[i].fg})`, bar: PALETTE[i].bar };
}
