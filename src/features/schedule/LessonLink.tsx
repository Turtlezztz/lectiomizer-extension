import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { HoverCard } from 'radix-ui';
import { BookOpen, Clock, MapPin, StickyNote, Users } from 'lucide-react';
import { appRoute } from '@/lib/lectio/paths';
import { fmtTime, fmtLongDate } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { Badge } from '@/components/ui/badge';
import type { Lesson } from './lessons';
import { splitPerson } from './lessons';

interface LinkProps {
  lesson: Lesson;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** In-app lesson route when we have one, else the Lectio page in a new tab. */
export const LessonLink = forwardRef<HTMLAnchorElement, LinkProps>(function LessonLink({ lesson, className, style, children, ...rest }, ref) {
  const route = appRoute(lesson.href);
  const label = `${lesson.subject}${lesson.title ? `, ${lesson.title}` : ''}, ${fmtTime(lesson.startDate)}–${fmtTime(lesson.endDate)}${lesson.rooms.length ? `, ${lesson.rooms.join(', ')}` : ''}${lesson.status === 'cancelled' ? ', aflyst' : lesson.status === 'changed' ? ', ændret' : ''}`;
  if (route) {
    return (
      <Link ref={ref} to={route} className={className} style={style} aria-label={label} {...rest}>
        {children}
      </Link>
    );
  }
  if (lesson.href) {
    return (
      <a ref={ref} href={lesson.href} target="_blank" rel="noreferrer" className={className} style={style} aria-label={label} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <span ref={ref} className={className} style={style} aria-label={label} {...rest}>
      {children}
    </span>
  );
});

export function StatusBadge({ status, className }: { status: Lesson['status']; className?: string }) {
  if (status === 'changed') return <Badge tone="accent" className={className}>Ændret</Badge>;
  if (status === 'cancelled') return <Badge tone="danger" className={className}>Aflyst</Badge>;
  return null;
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] text-fg-muted">
      <span className="mt-[3px] text-fg-subtle [&_svg]:size-3.5">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function LessonDetails({ lesson }: { lesson: Lesson }) {
  const c = subjectColor(lesson.hold);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: c.bar }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={'truncate text-[14px] font-semibold text-fg' + (lesson.status === 'cancelled' ? ' line-through decoration-fg-subtle' : '')}>{lesson.subject}</p>
            <StatusBadge status={lesson.status} />
          </div>
          <p className="truncate text-[13px] text-fg-muted">{lesson.title || lesson.holds.join(', ')}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Row icon={<Clock />}>
          <span className="tabular-nums">
            {fmtTime(lesson.startDate)}–{fmtTime(lesson.endDate)}
          </span>
          <span className="text-fg-subtle"> · {fmtLongDate(lesson.startDate)}</span>
        </Row>
        {lesson.rooms.length > 0 && <Row icon={<MapPin />}>{lesson.rooms.join(', ')}</Row>}
        {lesson.teachers.length > 0 && <Row icon={<Users />}>{lesson.teachers.map((t) => splitPerson(t).name).join(', ')}</Row>}
      </div>
      {lesson.homeworkText && (
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="mb-0.5 flex items-center gap-1.5 text-[12px] font-medium text-fg-muted">
            <BookOpen className="size-3.5" /> Lektier
          </p>
          <p className="line-clamp-6 text-[13px] whitespace-pre-line text-fg">{lesson.homeworkText}</p>
        </div>
      )}
      {lesson.noteText && (
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <p className="mb-0.5 flex items-center gap-1.5 text-[12px] font-medium text-fg-muted">
            <StickyNote className="size-3.5" /> Note
          </p>
          <p className="line-clamp-6 text-[13px] whitespace-pre-line text-fg">{lesson.noteText}</p>
        </div>
      )}
      {!lesson.homeworkText && lesson.hasHomework && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          <BookOpen className="size-3.5" /> Der er lektier til modulet
        </p>
      )}
    </div>
  );
}

/** Lesson link with a rich hover preview (pointer devices only). */
export function LessonHover({ lesson, children }: { lesson: Lesson; children: ReactNode }) {
  return (
    <HoverCard.Root openDelay={400} closeDelay={80}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-72 rounded-xl border border-border bg-surface p-4 shadow-pop animate-pop"
        >
          <LessonDetails lesson={lesson} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
