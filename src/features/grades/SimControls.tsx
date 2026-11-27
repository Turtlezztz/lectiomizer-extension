import { FlaskConical, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GradeChip } from './GradeChip';
import { SCALE, fmtNumber, scaleLabel, typeName, type Trend } from './grade-utils';
import { neededForTarget, parseTarget, simulate, targetText, type Overrides, type SimItem, type SimSource, type SimValue } from './simulator';

/** What a table needs to render editable grades while "Hvad nu hvis" is on. */
export interface SimCtx {
  items: Map<string, SimItem>;
  overrides: Overrides;
  setGrade: (id: string, value: SimValue | null) => void;
}

const OPTIONS = [...SCALE].reverse();

/**
 * A grade chip with an invisible native select on top: keyboard- and screen-reader-friendly,
 * and it still looks like the rest of the table. Simulated values get a dashed accent outline.
 */
export function SimGrade({ label, original, final, override, onChange }: {
  label: string;
  original: string | null;
  final?: boolean;
  override: SimValue | undefined;
  onChange: (value: SimValue | null) => void;
}) {
  const title = override
    ? `Simuleret · ${original ? `Lectio: ${original}` : 'ingen karakter i Lectio'}`
    : original ? `${original} fra Lectio · vælg for at simulere` : 'Ingen karakter endnu · vælg en forventet';
  return (
    <span className="relative inline-flex rounded-lg transition-opacity hover:opacity-80 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface">
      <GradeChip
        value={override ?? original ?? '+'}
        final={!override && final}
        size="sm"
        className={cn(
          override === '?' && 'border-dashed border-accent text-accent',
          override && override !== '?' && 'outline-[1.5px] outline-offset-2 outline-accent outline-dashed',
          !override && !original && 'border-dashed text-fg-subtle',
        )}
      />
      <select
        aria-label={`${label}, simuleret karakter`}
        title={title}
        value={override ?? ''}
        onChange={(e) => onChange((e.target.value || null) as SimValue | null)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        <option value="">{original ? `${original} (fra Lectio)` : 'Ingen karakter'}</option>
        {OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value="?">? (mangler, ukendt)</option>
      </select>
    </span>
  );
}

/** The mode's toolbar: simulated averages, Mål-snit and Nulstil. Sticks to the bottom while on. */
export function SimBar({ source, overrides, target, onTarget, onReset, onClose }: {
  source: SimSource;
  overrides: Overrides;
  target: string;
  onTarget: (value: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const now = simulate(source.items, {}, source.bonus);
  const sim = simulate(source.items, overrides, source.bonus);
  const goal = parseTarget(target);
  const text = targetText(target, goal === null ? null : neededForTarget(source.items, overrides, goal, source.bonus));
  const label = source.kind === 'diploma' ? 'Eksamenssnit' : 'Standpunktssnit';

  return (
    <section aria-label="Hvad nu hvis" className="sticky bottom-3 z-10 rounded-2xl border border-border bg-surface px-4 py-3 shadow-pop">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          <FlaskConical className="size-4 text-accent" /> Hvad nu hvis
        </p>
        <div className="flex gap-6" aria-live="polite">
          <SimStat label={label} value={sim.average} was={now.average} />
          {source.bonus != null && <SimStat label="Med bonus" value={sim.withBonus} was={now.withBonus} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-fg-muted">
            Mål-snit
            <Input
              value={target}
              onChange={(e) => onTarget(e.target.value)}
              inputMode="decimal"
              placeholder="fx 10,0"
              title={source.bonus != null ? 'Sammenlignes med snittet med bonus' : undefined}
              className="h-7 w-[4.5rem] px-2 text-center text-[13px] tabular-nums"
            />
          </label>
          {text && <p aria-live="polite" className="min-w-0 text-[12.5px] leading-snug text-fg">{text}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={!sim.changed} onClick={onReset}><RotateCcw /> Nulstil</Button>
          <Button size="icon-sm" variant="ghost" aria-label="Luk Hvad nu hvis" title="Luk" onClick={onClose}><X /></Button>
        </div>
      </div>
      {!sim.changed && (
        <p className="mt-2 text-[12px] text-fg-subtle">
          Klik på en karakter i {source.kind === 'diploma' ? 'beviset' : 'tabellen'} for at ændre eller udfylde den. Gemmes kun på denne enhed.
        </p>
      )}
    </section>
  );
}

function SimStat({ label, value, was }: { label: string; value: number | null; was: number | null }) {
  const changed = value !== null && was !== null && fmtNumber(value) !== fmtNumber(was);
  return (
    <div className="leading-none">
      <p className="text-[11.5px] text-fg-subtle">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('text-[19px] font-semibold tracking-[-0.02em] tabular-nums', changed ? 'text-accent' : 'text-fg')}>{value !== null ? fmtNumber(value) : '–'}</span>
        {changed && <span className="text-[11.5px] text-fg-subtle tabular-nums">nu {fmtNumber(was!)}</span>}
      </p>
    </div>
  );
}

const W = 28;
const H = 14;

/** Tiny sparkline + change, fx 7 → 10 → 10 = "+3". */
export function TrendMark({ trend }: { trend: Trend }) {
  const { points, delta, direction } = trend;
  const xy = points.map((p, i) => [2 + (i * (W - 4)) / (points.length - 1), 2 + ((12 - p.value) / 15) * (H - 4)] as const);
  const [lx, ly] = xy[xy.length - 1];
  const story = points.map((p) => `${typeName(p.type)} ${scaleLabel(String(p.value))}`).join(' → ');
  const tone = direction === 'up' ? 'text-success-soft-fg' : direction === 'down' ? 'text-danger-soft-fg' : 'text-fg-subtle';
  return (
    <span className="inline-flex items-center gap-1.5" title={story}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="text-border-strong">
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lx} cy={ly} r={2.25} className={cn('fill-current', tone)} />
      </svg>
      <span className={cn('w-6 text-[11.5px] font-medium tabular-nums', tone)} aria-hidden>{delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '±0'}</span>
      <span className="sr-only">Udvikling: {story}</span>
    </span>
  );
}
