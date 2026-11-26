import { cn } from '@/lib/cn';
import { gradeTone, type GradeTone } from './grade-utils';

export const CHIP_TONE: Record<GradeTone, string> = {
  top: 'bg-success-soft text-success-soft-fg',
  good: 'bg-info-soft text-info-soft-fg',
  mid: 'bg-surface-3 text-fg',
  low: 'bg-warning-soft text-warning-soft-fg',
  fail: 'bg-danger-soft text-danger-soft-fg',
  none: 'border border-border text-fg-muted',
};

export const BAR_TONE: Record<GradeTone, string> = {
  top: 'bg-success',
  good: 'bg-info',
  mid: 'bg-fg-subtle',
  low: 'bg-warning',
  fail: 'bg-danger',
  none: 'bg-border-strong',
};

export function GradeChip({ value, final, size = 'md', className, title }: { value: string | null | undefined; final?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string; title?: string }) {
  const tone = gradeTone(value);
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tabular-nums tracking-[-0.01em]',
        size === 'sm' && 'h-6 min-w-7 px-1.5 text-[12.5px]',
        size === 'md' && 'h-8 min-w-9 px-2 text-[14px]',
        size === 'lg' && 'h-10 min-w-11 px-2.5 text-[17px]',
        CHIP_TONE[tone],
        final && 'ring-2 ring-fg/15 ring-offset-2 ring-offset-surface',
        className,
      )}
    >
      {value || '–'}
    </span>
  );
}
