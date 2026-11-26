import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  neutral: 'bg-surface-3 text-fg-muted',
  accent: 'bg-accent-soft text-accent-soft-fg',
  success: 'bg-success-soft text-success-soft-fg',
  warning: 'bg-warning-soft text-warning-soft-fg',
  danger: 'bg-danger-soft text-danger-soft-fg',
  info: 'bg-info-soft text-info-soft-fg',
  outline: 'border border-border text-fg-muted',
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap [&_svg]:size-3', tones[tone], className)} {...props} />;
}

export function Dot({ tone = 'accent', className }: { tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info'; className?: string }) {
  const bg = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info' }[tone];
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', bg, className)} />;
}
