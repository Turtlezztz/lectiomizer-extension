import { forwardRef, useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { DropdownMenu } from 'radix-ui';
import { AlertCircle, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { usePhoto } from './data';
import { hasPhoto } from './model';

/** A person (or class/group) with their Lectio photo when there is one. */
export function PersonAvatar({
  id,
  name,
  photo,
  size = 32,
  className,
}: {
  id?: string;
  name: string;
  photo?: string | null;
  size?: number;
  className?: string;
}) {
  const src = usePhoto(id, photo);
  if (id && !hasPhoto(id) && !photo) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-muted', className)}
      >
        <Users style={{ width: size * 0.48, height: size * 0.48 }} />
      </span>
    );
  }
  return <Avatar name={name} src={src} size={size} className={className} />;
}

export function InlineError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn('flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-fg', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? 'Ukendt fejl'));

/** A text field that grows with its text up to `max` px, then scrolls. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, max = 180) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [ref, value, max]);
}

/** Enter sends on keyboards; on touch screens it makes a new line. */
export const touchScreen = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------ dropdown menu

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={6} className="z-50 min-w-[200px] animate-pop rounded-xl border border-border bg-surface p-1 shadow-pop">
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export const MenuItem = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    asChild?: boolean;
    danger?: boolean;
  }
>(function MenuItem({ children, onSelect, disabled, asChild, danger }, ref) {
  return (
    <DropdownMenu.Item
      ref={ref}
      asChild={asChild}
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0',
        danger ? 'text-danger-soft-fg' : 'text-fg [&_svg]:text-fg-subtle',
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
});

export function MenuSeparator() {
  return <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />;
}
