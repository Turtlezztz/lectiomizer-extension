import { useMemo, useState } from 'react';
import { AlertTriangle, PieChart } from 'lucide-react';
import { subjectColor, useSubjectLabel } from '@/lib/subjects';
import { subjectName } from '@/features/schedule/lessons';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import type { AbsenceOverview, AbsenceRemark } from './absence-utils';
import { breakdown, fmtPercent, gaugeTone, type Slice } from './absence-calc';
import { useThreshold } from './AbsenceCalculator';

type Kind = 'regular' | 'written';
type Scope = 'settled' | 'period';
const num = (n: number) => n.toLocaleString('da-DK', { maximumFractionDigits: 1 });
const TONE = { ok: 'text-fg-muted', warn: 'text-warning-soft-fg', high: 'text-danger-soft-fg' } as const;

/** "28/10-2026" → "28/10" */
const shortDate = (value: string) => value.replace(/-\d{4}$/, '');

/**
 * Where the absence lies: a ring split by hold, and each hold's own numbers,
 * so it is plain which subjects pull the total up.
 */
export function AbsenceBreakdown({ overview }: { overview: AbsenceOverview }) {
  const [threshold] = useThreshold();
  const label = useSubjectLabel();
  const [kind, setKind] = useState<Kind>('regular');
  const [scope, setScope] = useState<Scope>('settled');

  const all = useMemo(
    () => ({
      regular: { settled: breakdown(overview.holds, 'regular', 'settled'), period: breakdown(overview.holds, 'regular', 'period') },
      written: { settled: breakdown(overview.holds, 'written', 'settled'), period: breakdown(overview.holds, 'written', 'period') },
    }),
    [overview],
  );
  const has = (k: Kind, s: Scope) => all[k][s].total > 0;
  const kinds = (['regular', 'written'] as Kind[]).filter((k) => has(k, 'settled') || has(k, 'period'));
  if (!kinds.length) return null;
  const k = kinds.includes(kind) ? kind : kinds[0];
  const scopes = (['settled', 'period'] as Scope[]).filter((s) => has(k, s));
  const s = scopes.includes(scope) ? scope : scopes[0];
  const data = all[k][s];
  const unit = k === 'regular' ? 'moduler' : 'elevtimer';
  const periodLabel = overview.period ? `${shortDate(overview.period.from)}–${shortDate(overview.period.to)}` : 'Seneste måned';

  return (
    <Card>
      <CardHeader
        icon={<PieChart />}
        title="Hvor ligger fraværet?"
        description={`${k === 'regular' ? 'Moduler' : 'Elevtimer'} med fravær pr. fag, og fraværet i faget selv`}
      />
      {(kinds.length > 1 || scopes.length > 1) && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          {kinds.length > 1 && <Segmented value={k} onChange={setKind} options={[{ value: 'regular', label: 'Almindeligt' }, { value: 'written', label: 'Skriftligt' }]} />}
          {scopes.length > 1 && <Segmented value={s} onChange={setScope} options={[{ value: 'settled', label: 'Hele året' }, { value: 'period', label: periodLabel }]} />}
        </div>
      )}
      {data.slices.length === 0 ? (
        <p className="px-5 pb-5 text-[13.5px] text-fg-muted">Intet {k === 'regular' ? 'almindeligt' : 'skriftligt'} fravær {s === 'period' ? 'i perioden' : 'i år'}.</p>
      ) : (
        <div className="flex flex-col gap-6 px-5 pb-5 sm:flex-row sm:items-start">
          <Donut slices={data.slices} absent={data.absent} unit={unit} />
          <ul className="min-w-0 flex-1 space-y-3">
            {data.slices.map((slice) => {
              const name = label(slice.hold, subjectName(slice.hold));
              return (
                <li key={slice.hold}>
                  <div className="flex items-baseline gap-2 text-[13.5px]">
                    <span aria-hidden className="size-2.5 shrink-0 translate-y-[1px] rounded-full" style={{ background: subjectColor(slice.hold).bar }} />
                    <span className="min-w-0 truncate font-medium text-fg">{name}</span>
                    {name !== slice.hold && <span className="hidden shrink-0 text-[12px] text-fg-subtle sm:inline">{slice.hold}</span>}
                    <span className="ml-auto shrink-0 text-[12.5px] text-fg-muted tabular-nums" title={`${unit} med fravær af ${unit} i faget`}>{num(slice.absent)} af {num(slice.total)}</span>
                    <span className={cn('w-14 shrink-0 text-right font-medium tabular-nums', TONE[gaugeTone(slice.percent, threshold)])} title="Fraværet i faget">{fmtPercent(Math.round(slice.percent * 10) / 10)}</span>
                  </div>
                  <div className="mt-1.5 ml-[18px] h-1.5 overflow-hidden rounded-full bg-surface-3" title={`${Math.round(slice.share * 100)} % af dit fravær`}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, slice.share * 100)}%`, background: subjectColor(slice.hold).bar }} />
                  </div>
                </li>
              );
            })}
            {data.clean.length > 0 && (
              <li className="pt-1 text-[12.5px] text-fg-subtle">
                Intet fravær i {data.clean.map((hold) => label(hold, subjectName(hold))).join(', ')}.
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Ring split by hold; each arc is that hold's share of all the absence. */
function Donut({ slices, absent, unit }: { slices: Slice[]; absent: number; unit: string }) {
  // A small gap between arcs, taken evenly from each.
  const gap = slices.length > 1 ? 1.2 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto size-40 shrink-0 sm:mx-0" role="img" aria-label={`Fravær fordelt på hold: ${slices.map((x) => `${x.hold} ${Math.round(x.share * 100)} %`).join(', ')}`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        {slices.map((slice) => {
          const length = slice.share * 100;
          const arc = (
            <circle
              key={slice.hold}
              cx="60" cy="60" r="48" fill="none" strokeWidth="18" pathLength={100}
              strokeDasharray={`${Math.max(0.6, length - gap)} ${100 - Math.max(0.6, length - gap)}`}
              strokeDashoffset={-offset}
              style={{ stroke: subjectColor(slice.hold).bar }}
            >
              <title>{`${slice.hold}: ${num(slice.absent)} ${unit} (${Math.round(slice.share * 100)} % af dit fravær)`}</title>
            </circle>
          );
          offset += length;
          return arc;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[24px] leading-none font-semibold tracking-[-0.03em] text-fg tabular-nums">{num(absent)}</span>
        <span className="mt-1 text-[11.5px] text-fg-muted">{unit} fravær</span>
      </div>
    </div>
  );
}

/** Lectio's "Bemærkninger": warnings and talks about the absence. */
export function AbsenceRemarks({ remarks }: { remarks: AbsenceRemark[] }) {
  if (!remarks.length) return null;
  return (
    <Card className="border-warning/40 bg-warning-soft/40">
      <ul className="divide-y divide-border">
        {remarks.map((r, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-3.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-soft-fg" />
            <div className="min-w-0 text-[13.5px]">
              <p className="font-medium text-fg">{r.type || 'Bemærkning'}</p>
              {r.note && <p className="text-fg-muted">{r.note}</p>}
              <p className="mt-0.5 text-[12px] text-fg-subtle">{[r.date, r.by].filter(Boolean).join(' · ')}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
