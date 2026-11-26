import { NavLink } from 'react-router';
import { BookOpen, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/cn';

/** "Indhold | Elevfeedback" tabs shared by the lesson page and its elevfeedback page. */
export function LessonTabs({ id, feedbackCount }: { id: string; feedbackCount?: number }) {
  const base = `/lesson/${encodeURIComponent(id)}`;
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative -mb-px flex h-10 items-center gap-2 border-b-2 px-1 text-[13.5px] font-medium transition-colors [&_svg]:size-4',
      isActive ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
    );
  return (
    <nav aria-label="Lektionens faner" className="flex gap-5 border-b border-border">
      <NavLink to={base} end className={tab}>
        <BookOpen /> Indhold
      </NavLink>
      <NavLink to={`${base}/feedback`} className={tab}>
        <MessagesSquare /> Elevfeedback
        {!!feedbackCount && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold text-fg-muted tabular-nums">{feedbackCount}</span>}
      </NavLink>
    </nav>
  );
}
