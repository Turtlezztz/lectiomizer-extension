// Lectio's school-year menu. The year lives in the Lectio session, so switching
// here also switches lectio.dk in other tabs (and the other way round).
import { useSearchParams } from 'react-router';
import { CalendarRange, ChevronDown, History, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { currentYear, isPastTerm, termLabel } from '@/lib/lectio/term';
import { useSwitchTerm, useTermOptions } from '@/lib/lectio/useTerm';

/** Switch year; a ?week= from the old year would be outside the new one, so drop it. */
function useSwitch() {
  const switcher = useSwitchTerm();
  const [, setParams] = useSearchParams();
  const go = (year: number) =>
    switcher.mutate(year, {
      onSuccess: () => {
        setParams(
          (p) => {
            const next = new URLSearchParams(p);
            next.delete('week');
            return next;
          },
          { replace: true },
        );
      },
    });
  return { go, pending: switcher.isPending, error: switcher.error as Error | null };
}

export function YearSelect({ collapsed }: { collapsed: boolean }) {
  const term = useTermOptions();
  const { go, pending, error } = useSwitch();
  if (collapsed || !term || term.options.length < 2) return null;
  return (
    <div className="px-1 pb-1">
      <label className="flex h-9 items-center gap-3 rounded-lg px-1.5 text-[13px] text-fg-subtle hover:bg-surface-3/60 hover:text-fg" title="Skoleåret, Lectio viser. Det skifter også på lectio.dk.">
        {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : <CalendarRange className="size-4 shrink-0" />}
        <span className="flex-1 truncate">Skoleår</span>
        <span className="relative">
          <select
            value={term.year}
            disabled={pending}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Skoleår"
            className="h-7 cursor-pointer appearance-none rounded-md border border-border bg-surface pr-6 pl-2 text-[12.5px] font-medium text-fg tabular-nums outline-none hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60"
          >
            {term.options.map((o) => (
              <option key={o.year} value={o.year}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
        </span>
      </label>
      {error && <p className="px-1.5 pt-1 text-[12px] text-danger-soft-fg">{error.message}</p>}
    </div>
  );
}

/** Shown above every page while Lectio shows an earlier school year. */
export function PastTermBanner() {
  const term = useTermOptions();
  const { go, pending, error } = useSwitch();
  if (!term || !isPastTerm(term)) return null;
  const now = currentYear(term);
  return (
    <div role="status" className="border-b border-warning/25 bg-warning-soft text-warning-soft-fg">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:px-8">
        <History className="size-4 shrink-0" />
        <p className="min-w-0 flex-1 text-[13px]">
          <span className="font-medium">Du ser skoleåret {termLabel(term.year)}.</span>{' '}
          <span className={cn('opacity-85', error && 'hidden')}>Det gælder også Lectio i andre faner, og tjek for nyt er sat på pause.</span>
          {error && <span>{error.message}</span>}
        </p>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(now)}>
          {pending && <LoaderCircle className="animate-spin" />}
          Tilbage til {termLabel(now)}
        </Button>
      </div>
    </div>
  );
}
