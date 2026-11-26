import type { ReactNode } from 'react';
import { AlertTriangle, ExternalLink, RotateCw } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/cn';

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-fg-subtle [&_svg]:size-5">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, href, className }: { error: unknown; onRetry?: () => void; href?: string; className?: string }) {
  const message = error instanceof Error ? error.message : String(error ?? 'Ukendt fejl');
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangle />}
      title="Kunne ikke hente fra Lectio"
      description={message}
      action={
        <div className="flex gap-2">
          {onRetry && <Button size="sm" onClick={onRetry}><RotateCw /> Prøv igen</Button>}
          {href && <Button size="sm" variant="ghost" asChild><a href={href} target="_blank" rel="noreferrer"><ExternalLink /> Åbn i Lectio</a></Button>}
        </div>
      }
    />
  );
}
