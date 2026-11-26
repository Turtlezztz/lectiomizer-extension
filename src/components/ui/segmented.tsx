import { cn } from '@/lib/cn';

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode; count?: number }>; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex items-center gap-0.5 rounded-lg bg-surface-3/70 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-all',
            o.value === value ? 'bg-surface text-fg shadow-card ring-1 ring-border' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
          {o.count != null && <span className={cn('tabular-nums text-[11.5px]', o.value === value ? 'text-fg-muted' : 'text-fg-subtle')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
