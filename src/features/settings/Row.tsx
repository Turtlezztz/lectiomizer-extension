import type { ReactNode } from 'react';

/** One settings row: label + optional hint on the left, the control on the right. Shared by every settings section. */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-[13.5px] font-medium text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-fg-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
