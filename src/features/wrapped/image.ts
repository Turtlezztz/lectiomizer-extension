// "Gem som billede": draws the summary card on a canvas (no dependency) and
// downloads it as a PNG. Only the student's own numbers, subjects and weeks –
// never names of other people (teachers, classmates).

export interface ImageTile {
  value: string;
  label: string;
}

export interface ImageSummary {
  /** "2025/26" */
  year: string;
  /** "aug. – nov. 2026" */
  period: string;
  tiles: ImageTile[];
}

const W = 1080;
const H = 1350;

/** A theme token from app.css; canvas ignores colours it can't parse, so a fallback is set first. */
function token(ctx: CanvasRenderingContext2D, name: string, fallback: string): string | CanvasGradient | CanvasPattern {
  ctx.fillStyle = fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  if (value) ctx.fillStyle = value;
  return ctx.fillStyle;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrink the font until `text` fits `max` px. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 18 && ctx.measureText(text).width > max) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
}

export async function renderSummary(summary: ImageSummary): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const colors = {
    bg: token(ctx, 'bg', '#faf9f7'),
    surface: token(ctx, 'surface', '#ffffff'),
    border: token(ctx, 'border', '#e6e4e0'),
    fg: token(ctx, 'fg', '#1f1c19'),
    muted: token(ctx, 'fg-muted', '#6b6661'),
    accent: token(ctx, 'accent', '#e0533d'),
    accentFg: token(ctx, 'accent-fg', '#ffffff'),
  };

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Header band
  const pad = 72;
  ctx.fillStyle = colors.accent;
  roundRect(ctx, pad, pad, W - pad * 2, 300, 40);
  ctx.fill();
  ctx.fillStyle = colors.accentFg;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 34px ${family}`;
  ctx.fillText('Mit skoleår i tal', pad + 48, pad + 86);
  ctx.font = `700 120px ${family}`;
  ctx.fillText(summary.year, pad + 44, pad + 214);
  ctx.font = `500 30px ${family}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(summary.period, pad + 48, pad + 262);
  ctx.globalAlpha = 1;

  // Tiles, two per row
  const tiles = summary.tiles.slice(0, 6);
  const gap = 28;
  const top = pad + 300 + 40;
  const rows = Math.ceil(tiles.length / 2);
  const tileW = (W - pad * 2 - gap) / 2;
  const tileH = Math.min(230, (H - top - 140 - gap * (rows - 1)) / Math.max(rows, 1));
  tiles.forEach((tile, i) => {
    const x = pad + (i % 2) * (tileW + gap);
    const y = top + Math.floor(i / 2) * (tileH + gap);
    ctx.fillStyle = colors.surface;
    roundRect(ctx, x, y, tileW, tileH, 28);
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colors.fg;
    fit(ctx, tile.value, 700, 84, family, tileW - 80);
    ctx.fillText(tile.value, x + 40, y + tileH / 2 + 18);
    ctx.fillStyle = colors.muted;
    fit(ctx, tile.label, 500, 30, family, tileW - 80);
    ctx.fillText(tile.label, x + 40, y + tileH / 2 + 66);
  });

  // Footer
  ctx.fillStyle = colors.muted;
  ctx.font = `500 28px ${family}`;
  ctx.fillText('Lavet med Lectiomizer', pad, H - pad + 8);
  return canvas;
}

/** Render and download as `lectio-wrapped-2025-26.png`. */
export async function saveSummaryImage(summary: ImageSummary): Promise<void> {
  const canvas = await renderSummary(summary);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Billedet kunne ikke laves');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lectio-wrapped-${summary.year.replace('/', '-')}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
