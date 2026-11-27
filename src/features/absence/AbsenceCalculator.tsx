import { useEffect, useMemo, useState } from 'react';
import { getItem, onItemChange, setItem } from '@/lib/storage';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { parsePercent, type AbsenceData, type AbsenceOverview } from './absence-utils';
import {
  DEFAULT_THRESHOLD, THRESHOLD_KEY, RECENT_DAYS, bufferNow, fmtPercent, gaugeTone, modulesToRecover,
  percentOf, projectYearEnd, resolveCounts, type Counts, type GaugeTone,
} from './absence-calc';

const THRESHOLDS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20];

const STROKE: Record<GaugeTone, string> = { ok: 'stroke-success', warn: 'stroke-warning', high: 'stroke-danger' };
const INK: Record<GaugeTone, string> = { ok: 'text-fg', warn: 'text-warning-soft-fg', high: 'text-danger-soft-fg' };

/** The user's own absence limit in percent (local, shared by the cards on the page). */
export function useThreshold() {
  const [value, setValue] = useState(DEFAULT_THRESHOLD);
  useEffect(() => {
    let alive = true;
    getItem<number>(THRESHOLD_KEY, DEFAULT_THRESHOLD).then((v) => alive && typeof v === 'number' && v > 0 && setValue(v));
    const off = onItemChange<number>(THRESHOLD_KEY, (v) => typeof v === 'number' && v > 0 && setValue(v));
    return () => {
      alive = false;
      off();
    };
  }, []);
  const update = (v: number) => {
    setValue(v);
    void setItem(THRESHOLD_KEY, v);
  };
  return [value, update] as const;
}

const num = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1 });
type Unit = { one: string; many: string };
const MODULES: Unit = { one: 'modul', many: 'moduler' };
const HOURS: Unit = { one: 'elevtime', many: 'elevtimer' };
const count = (n: number, unit: Unit) => `${num(n)} ${n === 1 ? unit.one : unit.many}`;

/**
 * The two overall numbers – almindeligt and skriftligt fravær, all holds together –
 * each with how much room is left before the user's own limit.
 */
export function AbsenceCalculator({ absence, overview }: { absence: AbsenceData; overview: AbsenceOverview | undefined }) {
  const [threshold, setThreshold] = useThreshold();
  const regularTotal = absence.totals.find((t) => /almindelig/i.test(t.label)) ?? absence.totals[0];
  const writtenTotal = absence.totals.find((t) => /skriftlig/i.test(t.label));
  const rows = absence.history?.rows ?? [];

  const regularPct = (regularTotal ? parsePercent(regularTotal.value) : null) ?? overview?.total.regular.settled.percent ?? null;
  const writtenPct = (writtenTotal ? parsePercent(writtenTotal.value) : null) ?? overview?.total.written.settled.percent ?? null;
  // Lectio's own counts when the overview has them; else an estimate from the registrations (modules only).
  const regular = useMemo(() => resolveCounts(overview?.total.regular.settled, regularPct, rows), [overview, regularPct, rows]);
  const written = useMemo(() => resolveCounts(overview?.total.written.settled, writtenPct, []), [overview, writtenPct]);
  const projection = useMemo(() => (regular ? projectYearEnd(regular, rows, new Date()) : null), [regular, rows]);

  if (regularPct === null && writtenPct === null) return null;
  const pct = regularPct ?? 0;
  const showProjection = projection?.recent && Math.abs(projection.percent - pct) >= 0.1;

  return (
    <Card>
      <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Panel label={regularTotal?.label || 'Almindeligt fravær'} percent={regularPct} counts={regular} threshold={threshold} unit={MODULES} held="holdte moduler" />
        <Panel label={writtenTotal?.label || 'Skriftligt fravær'} percent={writtenPct} counts={written} threshold={threshold} unit={HOURS} held="elevtimer med frist" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-5 py-3 text-[12.5px] text-fg-muted">
        {showProjection && (
          <span>
            Fortsætter du som de seneste {RECENT_DAYS / 7} uger, ender året på ca.{' '}
            <span className={cn('font-medium tabular-nums', projection!.percent >= threshold ? 'text-danger-soft-fg' : 'text-fg')}>{fmtPercent(Math.round(projection!.percent * 10) / 10)}</span> almindeligt fravær.
          </span>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-fg-subtle">
          Min grænse
          <select
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px] text-fg tabular-nums outline-none hover:border-border-strong focus:border-accent"
          >
            {(THRESHOLDS.includes(threshold) ? THRESHOLDS : [...THRESHOLDS, threshold].sort((a, b) => a - b)).map((v) => (
              <option key={v} value={v}>{v} %</option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}

function Panel({ label, percent, counts, threshold, unit, held }: { label: string; percent: number | null; counts: Counts | null; threshold: number; unit: Unit; held: string }) {
  if (percent === null) {
    return (
      <div className="flex items-center gap-4 p-5">
        <p className="text-[13px] text-fg-muted">{label}: ingen oplysninger fra Lectio.</p>
      </div>
    );
  }
  const pct = percent ?? (counts ? percentOf(counts.absent, counts.held) : 0);
  const over = pct >= threshold;
  const approx = counts?.source === 'estimate' ? 'ca. ' : '';
  const now = counts ? bufferNow(counts.absent, counts.held, threshold) : null;
  // No room left before the limit is a warning, however far the ring is from full.
  const tone = !over && now === 0 ? 'warn' : gaugeTone(pct, threshold);
  const recover = counts && over ? modulesToRecover(counts.absent, counts.held, threshold) : null;
  return (
    <div className="flex items-center gap-4 p-5">
      <Gauge percent={pct} threshold={threshold} tone={tone} label={label} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[12.5px] font-medium text-fg-muted">{label}</p>
        <p className="text-[14px] leading-snug text-fg">
          {!counts ? (
            pct > 0 ? `${fmtPercent(pct)} af din grænse på ${fmtPercent(threshold)}.` : 'Intet fravær registreret.'
          ) : over ? (
            <>Over din grænse. <b className="font-semibold tabular-nums">{approx}{count(recover!, unit)}</b> uden fravær bringer dig under igen.</>
          ) : now === 0 ? (
            <>Lige under din grænse – næste fravær tager dig over.</>
          ) : (
            <>Plads til <b className="font-semibold tabular-nums">{approx}{count(now!, unit)}</b> mere, før du rammer {fmtPercent(threshold)}.</>
          )}
        </p>
        {counts && (
          <p className="text-[12px] text-fg-subtle tabular-nums" title={counts.source === 'estimate' ? 'Anslået ud fra dine fraværsregistreringer' : undefined}>
            {num(counts.absent)} af {approx}{num(counts.held)} {held}
          </p>
        )}
      </div>
    </div>
  );
}

/** Ring that fills up towards the threshold: full ring = the user's limit. */
function Gauge({ percent, threshold, tone, label }: { percent: number; threshold: number; tone: GaugeTone; label: string }) {
  const fill = Math.min(100, (percent / threshold) * 100);
  return (
    <div
      className="relative size-24 shrink-0"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={threshold}
      aria-valuenow={percent}
      aria-label={`${label} ${fmtPercent(percent)} af grænsen ${fmtPercent(threshold)}`}
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-surface-3" />
        <circle
          cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round" pathLength={100}
          strokeDasharray={`${fill} 100`}
          className={cn('transition-[stroke-dasharray] duration-700', STROKE[tone])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn('text-[19px] leading-none font-semibold tracking-[-0.03em] tabular-nums', INK[tone])}>{fmtPercent(percent)}</span>
        <span className={cn('mt-1 text-[10.5px] tabular-nums', percent >= threshold ? 'text-danger-soft-fg' : 'text-fg-subtle')}>
          {percent >= threshold ? 'over grænsen' : `af ${fmtPercent(threshold)}`}
        </span>
      </div>
    </div>
  );
}
