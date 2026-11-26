import { cn } from '@/lib/cn';

export function Switch({ checked, onChange, disabled, label, className }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-border-strong',
        className,
      )}
    >
      <span className={cn('inline-block size-[18px] rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  );
}
