import { AlertCircle, CheckCircle2, Clock, FileArchive, FileImage, FileSpreadsheet, FileText, FileType2, Hourglass, Presentation } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { subjectColor } from '@/lib/subjects';
import { untilText, urgency } from '@/lib/format';
import { documentLabel, type StatusKind } from './model';

export function SubjectDot({ hold, className }: { hold: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: subjectColor(hold).bar }} />;
}

/** Deadline urgency: "Overskredet", "om 5 t", "Denne uge". Nothing for later deadlines. */
export function UrgencyBadge({ deadline, now }: { deadline: Date | null; now?: Date }) {
  const u = urgency(deadline, now);
  if (u === 'overdue') return <Badge tone="danger"><AlertCircle /> Overskredet</Badge>;
  if (u === 'soon') return <Badge tone="warning"><Clock /> {untilText(deadline!, now)}</Badge>;
  if (u === 'week') return <Badge tone="info">Denne uge</Badge>;
  return null;
}

const statusTone: Record<StatusKind, Tone> = { delivered: 'success', missing: 'danger', waiting: 'neutral', other: 'outline' };

export function StatusBadge({ kind, label, overdue }: { kind: StatusKind; label: string; overdue?: boolean }) {
  if (kind === 'waiting' && overdue) return <Badge tone="danger"><AlertCircle /> Ikke afleveret</Badge>;
  const icon = kind === 'delivered' ? <CheckCircle2 /> : kind === 'missing' ? <AlertCircle /> : kind === 'waiting' ? <Hourglass /> : null;
  return (
    <Badge tone={statusTone[kind]}>
      {icon}
      {label || '–'}
    </Badge>
  );
}

function FileIcon({ ext, className }: { ext: string; className?: string }) {
  const Icon = /^(png|jpe?g|gif|webp|heic|svg)$/.test(ext)
    ? FileImage
    : /^(xlsx?|csv|ods|numbers)$/.test(ext)
      ? FileSpreadsheet
      : /^(pptx?|key|odp)$/.test(ext)
        ? Presentation
        : /^(zip|rar|7z)$/.test(ext)
          ? FileArchive
          : ext === 'pdf'
            ? FileType2
            : FileText;
  return <Icon className={className} />;
}

/** A Lectio document link as a compact file tile. Always opens in a new tab. */
export function FileLink({ label, href, compact }: { label: string; href: string; compact?: boolean }) {
  const { name, meta, ext } = documentLabel(label);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Åbn ${name}`}
      className={cn(
        'group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface transition-colors hover:border-border-strong hover:bg-surface-2',
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5',
      )}
    >
      <span className={cn('flex shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-fg', compact ? 'size-7' : 'size-9')}>
        <FileIcon ext={ext} className={compact ? 'size-3.5' : 'size-4'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-fg group-hover:underline group-hover:decoration-border-strong group-hover:underline-offset-2">{name}</span>
        {(meta || ext) && <span className="block truncate text-[12px] text-fg-subtle">{[ext.toUpperCase(), meta].filter(Boolean).join(' · ')}</span>}
      </span>
    </a>
  );
}

export function InlineError({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className={cn('flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-fg', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
