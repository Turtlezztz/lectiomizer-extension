import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 py-6 sm:px-8 sm:py-8 animate-in', wide ? 'max-w-[1400px]' : 'max-w-[1100px]', className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12.5px] font-medium text-fg-subtle">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-fg">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
