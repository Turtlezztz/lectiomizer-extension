// Udseende rows: accent colour, density and start page.
import { Check } from 'lucide-react';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { useSettings, type Settings } from '@/lib/settings';
import { cn } from '@/lib/cn';
import { Row } from './Row';

type Accent = NonNullable<Settings['accent']>;
type StartPage = NonNullable<Settings['startPage']>;

/** Swatches show each preset's own light-theme colour (same values as app.css). */
const ACCENTS: Array<{ value: Accent; label: string; swatch: string }> = [
  { value: 'coral', label: 'Koral', swatch: 'oklch(0.62 0.19 28)' },
  { value: 'blue', label: 'Blå', swatch: 'oklch(0.58 0.17 255)' },
  { value: 'green', label: 'Grøn', swatch: 'oklch(0.58 0.14 155)' },
  { value: 'violet', label: 'Lilla', swatch: 'oklch(0.58 0.18 295)' },
  { value: 'pink', label: 'Pink', swatch: 'oklch(0.58 0.19 350)' },
];

const START_PAGES: Array<{ value: StartPage; label: string }> = [
  { value: 'home', label: 'Overblik' },
  { value: 'schedule', label: 'Skema' },
  { value: 'assignments', label: 'Opgaver' },
  { value: 'homework', label: 'Lektier' },
  { value: 'messages', label: 'Beskeder' },
];


export function AppearanceSettings() {
  const { settings, update } = useSettings();
  const accent = settings.accent ?? 'coral';
  return (
    <>
      <Row label="Accentfarve">
        <div role="radiogroup" aria-label="Accentfarve" className="flex gap-1.5">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={accent === a.value}
              aria-label={a.label}
              title={a.label}
              onClick={() => update({ accent: a.value })}
              className={cn('flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110', accent === a.value ? 'border-fg' : 'border-transparent')}
              style={{ background: a.swatch }}
            >
              {accent === a.value && <Check className="size-3.5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Tæthed">
        <Segmented
          value={settings.density ?? 'normal'}
          onChange={(density) => update({ density })}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'compact', label: 'Kompakt' },
          ]}
        />
      </Row>
      <Row label="Startside" hint="Siden appen åbner på fra værktøjslinjen.">
        <Select value={settings.startPage ?? 'home'} onChange={(e) => update({ startPage: e.target.value as StartPage })} aria-label="Startside">
          {START_PAGES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
      </Row>
    </>
  );
}
