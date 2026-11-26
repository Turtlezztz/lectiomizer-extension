import { useId, useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, CloudUpload, FileText, LoaderCircle, Lock, Paperclip, Send, X } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { uploadDocument } from '@/lib/lectio/client';
import type { Loaded } from '@/lib/lectio/query';
import { cn } from '@/lib/cn';
import { formatBytes, type AssignmentData } from './model';
import { InlineError } from './parts';

type Mutate = (input: { element?: Element | null; target?: string; argument?: string; fields?: Record<string, string> }) => Promise<unknown>;

export function HandInClosed() {
  return (
    <Card className="flex items-center gap-3 px-5 py-4 text-[13.5px] text-fg-muted">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-subtle">
        <Lock className="size-4" />
      </span>
      Afleveringen er lukket. Der kan ikke skrives flere indlæg.
    </Card>
  );
}

/**
 * Comment + document hand-in. Comments post Lectio's "Send kun kommentar".
 * Documents go through Lectio's document chooser: upload to dokumentupload.aspx,
 * then post the returned id back as "Vælg dokument og send" does (the comment rides along).
 */
export function HandInCard({ loaded, mutate, pending, error, busy, lectioUrl }: { loaded: Loaded<AssignmentData>; mutate: Mutate; pending: boolean; error: unknown; busy: boolean; lectioUrl: string }) {
  const handIn = loaded.data.handIn!;
  const [comment, setComment] = useState(handIn.comment?.value?.trim() ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const commentId = useId();

  const canComment = !!handIn.send && !!handIn.comment;
  const canUpload = !!handIn.chooser;
  const working = busy || uploading;
  const showPending = pending || uploading;
  const ready = file ? canUpload : canComment && comment.trim().length > 0;

  const pick = (files: FileList | null | undefined) => {
    const next = files?.[0];
    if (!next) return;
    setFile(next);
    setLocalError(null);
    setSent(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!working) pick(e.dataTransfer.files);
  };

  const submit = async () => {
    setLocalError(null);
    setSent(null);
    const fields: Record<string, string> = {};
    const commentName = handIn.comment?.getAttribute('name');
    if (commentName) fields[commentName] = comment;
    try {
      if (file) {
        const chooser = handIn.chooser!;
        setUploading(true);
        let serializedId: string;
        try {
          serializedId = await uploadDocument(loaded.url, file);
        } catch (e) {
          setLocalError(e instanceof Error ? e.message : `Kunne ikke uploade ${file.name}`);
          return;
        } finally {
          setUploading(false);
        }
        fields[chooser.field] = JSON.stringify({ serializedId });
        await mutate({ target: chooser.target, argument: chooser.argument, fields });
        setSent(`${file.name} er sendt til Lectio.`);
      } else {
        await mutate({ element: handIn.send, fields });
        setSent('Din kommentar er sendt.');
      }
      setFile(null);
      setComment('');
      if (input.current) input.current.value = '';
    } catch {
      /* shown via `error` */
    }
  };

  return (
    <Card>
      <CardHeader icon={<Send />} title="Aflever" description="Upload dit dokument og skriv evt. en kommentar til din lærer." />
      <CardBody className="space-y-4">
        {canUpload && (
          <div>
            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 animate-in">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-fg">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-fg">{file.name}</div>
                  <div className="text-[12px] tabular-nums text-fg-subtle">{formatBytes(file.size)}</div>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Fjern fil" disabled={working} onClick={() => { setFile(null); if (input.current) input.current.value = ''; }}>
                  <X />
                </Button>
              </div>
            ) : (
              <label
                onDragOver={(e) => { e.preventDefault(); if (!working) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed px-4 py-7 text-center transition-colors',
                  dragging ? 'border-accent bg-accent-soft/60' : 'border-border-strong/70 bg-surface-2/40 hover:border-accent/60 hover:bg-surface-2',
                  working && 'pointer-events-none opacity-60',
                )}
              >
                <span className={cn('flex size-10 items-center justify-center rounded-xl transition-colors', dragging ? 'bg-accent text-accent-fg' : 'bg-surface text-fg-muted shadow-card ring-1 ring-border')}>
                  <CloudUpload className="size-5" />
                </span>
                <span className="text-[13.5px] font-medium text-fg">{dragging ? 'Slip filen her' : 'Træk en fil hertil'}</span>
                <span className="text-[12.5px] text-fg-muted">
                  eller <span className="font-medium text-accent-soft-fg underline decoration-accent/40 underline-offset-2">vælg fra computeren</span>
                </span>
                <input ref={input} type="file" className="sr-only" disabled={working} onChange={(e) => pick(e.target.files)} />
              </label>
            )}
          </div>
        )}

        {handIn.chosen && (
          <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            <Paperclip className="size-3.5 text-fg-subtle" /> Valgt i Lectio: <span className="font-medium text-fg">{handIn.chosen}</span>
          </p>
        )}

        {handIn.comment && (
          <div className="space-y-1.5">
            <label htmlFor={commentId} className="text-[12.5px] font-medium text-fg-muted">
              Kommentar <span className="font-normal text-fg-subtle">(valgfri)</span>
            </label>
            <Textarea
              id={commentId}
              value={comment}
              disabled={working}
              onChange={(e) => { setComment(e.target.value); setSent(null); }}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && ready && !working) submit(); }}
              placeholder="Skriv til din lærer…"
              rows={3}
            />
          </div>
        )}

        {localError ? (
          <InlineError error={localError} />
        ) : (
          <InlineError error={error} />
        )}
        {localError && (
          <a href={lectioUrl} target="_blank" rel="noreferrer" className="inline-block text-[13px] font-medium text-accent-soft-fg underline decoration-accent/40 underline-offset-2">
            Åbn afleveringen i Lectio
          </a>
        )}
        {sent && !showPending && !error && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success-soft-fg animate-in">
            <CheckCircle2 className="size-4 shrink-0" /> {sent}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[12px] text-fg-subtle">{file ? 'Dokumentet afleveres med din kommentar.' : canComment ? 'Uden fil sendes kun kommentaren.' : ''}</p>
          <Button variant="primary" disabled={!ready || working} onClick={submit} className="max-sm:w-full">
            {showPending ? <LoaderCircle className="animate-spin" /> : file ? <CloudUpload /> : <Send />}
            {uploading ? 'Uploader…' : pending ? 'Sender…' : file ? 'Aflever dokument' : 'Send kommentar'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
