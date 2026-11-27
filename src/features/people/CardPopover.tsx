// The shell shared by person and room cards: inline text that opens a popover
// on click. Safe inside links and buttons: the click opens the card instead of
// following the row it sits in.
import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { cn } from '@/lib/cn';

export function CardPopover({
  label,
  title,
  className,
  trigger,
  children,
}: {
  /** Accessible name of what the card is about ("Lene Madsen", "Lokale A12"). */
  label: string;
  title?: string;
  className?: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const toggle = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => !o);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span
          ref={anchor}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label ? `Vis ${label}` : undefined}
          title={title}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') toggle(e);
          }}
          className={cn(
            'cursor-pointer rounded-[3px] decoration-current/35 underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-none',
            open && 'underline',
            className,
          )}
        >
          {trigger}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // React events bubble through portals: keep clicks in the card away from the row behind the trigger.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            anchor.current?.focus({ preventScroll: true });
          }}
          aria-label={label || undefined}
          className="z-50 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl outline-none border border-border bg-surface text-left text-fg shadow-pop animate-pop"
        >
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
