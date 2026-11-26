import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Native select, styled to match Input. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <select
        className="h-9 w-full appearance-none rounded-lg border border-border bg-surface pr-8 pl-3 text-sm text-fg outline-none transition-colors hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent/15"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle" />
    </span>
  );
}
