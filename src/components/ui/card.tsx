import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-card', className)} {...props} />;
}

export function CardHeader({ title, icon, action, description, className }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-3 px-5 pt-4 pb-3', className)}>
      {icon && <span className="mt-0.5 text-fg-subtle [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}
