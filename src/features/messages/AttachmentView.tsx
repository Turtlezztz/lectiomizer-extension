// A file sent with a message, shown in the conversation: pictures, PDFs, Word
// documents, video, sound and text open right there; other files stay a link.
// Lectio sends every file as a download (application/octet-stream), so the
// bytes are fetched with the user's session and given their real type here.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from 'radix-ui';
import { AlertCircle, Download, FileText, Film, Image as ImageIcon, Maximize2, Music, Paperclip, RotateCw, X } from 'lucide-react';
import { fetchFile } from '@/lib/lectio/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { AUTO_LOAD_BYTES, fileType, sizeBytes, type FileKind } from './files';
import type { Attachment } from './types';

const ICONS: Record<FileKind, typeof Paperclip> = {
  image: ImageIcon,
  pdf: FileText,
  docx: FileText,
  text: FileText,
  video: Film,
  audio: Music,
  other: Paperclip,
};

function useFile(file: Attachment, enabled: boolean) {
  return useQuery({
    queryKey: ['lectio-file', file.href],
    queryFn: ({ signal }) => fetchFile(file.href, signal),
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/** An object URL for the bytes with their real type; revoked when no longer shown. */
function useObjectUrl(blob: Blob | undefined, mime: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const next = URL.createObjectURL(new Blob([blob], { type: mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob, mime]);
  return url;
}

export function AttachmentView({ file }: { file: Attachment }) {
  const type = fileType(file.name);
  const big = sizeBytes(file.size) > AUTO_LOAD_BYTES;
  const [wanted, setWanted] = useState(!big);
  const [open, setOpen] = useState(false);
  const previewable = type.kind !== 'other';
  const q = useFile(file, previewable && wanted);
  const url = useObjectUrl(q.data, type.mime);

  if (!previewable) return <FileChip file={file} kind={type.kind} />;

  const bar = (
    <FileBar file={file} kind={type.kind} download={url} onExpand={url && type.kind !== 'audio' ? () => setOpen(true) : undefined} />
  );

  let body: ReactNode;
  if (!wanted) {
    body = (
      <button
        type="button"
        onClick={() => setWanted(true)}
        className="flex h-24 w-full items-center justify-center gap-2 text-[13px] font-medium text-accent-soft-fg hover:bg-surface-2"
      >
        Vis filen ({file.size})
      </button>
    );
  } else if (q.error) {
    body = (
      <div className="flex flex-wrap items-center gap-2 px-3 py-3 text-[13px] text-fg-muted">
        <AlertCircle className="size-4 shrink-0 text-danger" />
        <span className="min-w-0 flex-1">Filen kunne ikke hentes.</span>
        <Button size="sm" variant="ghost" onClick={() => q.refetch()}>
          <RotateCw /> Prøv igen
        </Button>
      </div>
    );
  } else if (!url || !q.data) {
    body = <Skeleton className={cn('w-full rounded-none', type.kind === 'audio' ? 'h-12' : type.kind === 'image' ? 'h-48' : 'h-[min(420px,55vh)]')} />;
  } else if (type.kind === 'image') {
    body = (
      <button type="button" onClick={() => setOpen(true)} className="block w-full cursor-zoom-in bg-surface-2" aria-label={`Vis ${file.name} i stor størrelse`}>
        <img src={url} alt={file.name} className="mx-auto block max-h-80 w-auto max-w-full object-contain" />
      </button>
    );
  } else if (type.kind === 'video') {
    body = <video src={url} controls preload="metadata" className="block max-h-80 w-full bg-black" />;
  } else if (type.kind === 'audio') {
    body = <audio src={url} controls preload="metadata" className="block w-full px-2 py-2" />;
  } else {
    body = (
      <div className="h-[min(420px,55vh)]">
        <DocumentView kind={type.kind} url={url} blob={q.data} name={file.name} />
      </div>
    );
  }

  return (
    <div className="w-[520px] max-w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {body}
      {bar}
      {url && q.data && (
        <Lightbox open={open} onOpenChange={setOpen} file={file} kind={type.kind} url={url} blob={q.data} />
      )}
    </div>
  );
}

function FileChip({ file, kind }: { file: Attachment; kind: FileKind }) {
  const Icon = ICONS[kind];
  return (
    <a
      href={file.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-[13px] text-fg shadow-card transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-fg">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 truncate font-medium">{file.name}</span>
      {file.size && <span className="shrink-0 text-[12px] text-fg-subtle">{file.size}</span>}
      <Download className="size-3.5 shrink-0 text-fg-subtle" />
    </a>
  );
}

function FileBar({ file, kind, download, onExpand }: { file: Attachment; kind: FileKind; download: string | null; onExpand?: () => void }) {
  const Icon = ICONS[kind];
  return (
    <div className="flex items-center gap-2 border-t border-border py-1.5 pr-1.5 pl-3 text-[13px]">
      <Icon className="size-4 shrink-0 text-fg-subtle" />
      <span className="min-w-0 flex-1 truncate font-medium text-fg" title={file.name}>
        {file.name}
      </span>
      {file.size && <span className="shrink-0 text-[12px] text-fg-subtle tabular-nums">{file.size}</span>}
      {onExpand && (
        <Button variant="ghost" size="icon-sm" aria-label="Vis i fuld størrelse" title="Vis i fuld størrelse" onClick={onExpand}>
          <Maximize2 />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" asChild>
        <a
          href={download || file.href}
          download={download ? file.name : undefined}
          target={download ? undefined : '_blank'}
          rel="noreferrer"
          aria-label={`Hent ${file.name}`}
          title="Hent"
        >
          <Download />
        </a>
      </Button>
    </div>
  );
}

/** PDF, Word and text files, filling their box. */
function DocumentView({ kind, url, blob, name, page }: { kind: FileKind; url: string; blob: Blob; name: string; page?: boolean }) {
  if (kind === 'pdf') return <iframe src={`${url}#view=FitH`} title={name} className="block size-full border-0 bg-surface-2" />;
  if (kind === 'docx') return <DocxView blob={blob} page={page} />;
  return <TextView blob={blob} />;
}

function TextView({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    blob.text().then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [blob]);
  return (
    <pre className="size-full overflow-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg">{text ?? ''}</pre>
  );
}

/**
 * Word documents through docx-preview (loaded only when one is shown). In the
 * conversation the text flows to the box's width; full size shows real pages.
 */
function DocxView({ blob, page }: { blob: Blob; page?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    setFailed(false);
    el.replaceChildren();
    import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(blob, el, undefined, {
          inWrapper: !!page,
          ignoreWidth: !page,
          ignoreHeight: !page,
          breakPages: !!page,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: !!page,
          renderFooters: !!page,
          experimental: false,
          useBase64URL: true,
        }),
      )
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      el.replaceChildren();
    };
  }, [blob, page]);
  if (failed) {
    return (
      <div className="flex size-full items-center justify-center gap-2 px-4 text-[13px] text-fg-muted">
        <AlertCircle className="size-4 shrink-0" /> Dokumentet kan ikke vises her. Hent det i stedet.
      </div>
    );
  }
  return (
    <div
      ref={host}
      className={cn(
        'size-full overflow-auto bg-white text-black',
        page ? '[&_.docx-wrapper]:bg-surface-2! [&_.docx-wrapper]:p-6!' : '[&_section.docx]:px-5! [&_section.docx]:py-4! [&_section.docx]:mb-0!',
      )}
    />
  );
}

function Lightbox({
  open,
  onOpenChange,
  file,
  kind,
  url,
  blob,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: Attachment;
  kind: FileKind;
  url: string;
  blob: Blob;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] animate-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-pop sm:inset-6"
        >
          <div className="flex items-center gap-2 border-b border-border py-2 pr-2 pl-4">
            <Dialog.Title className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{file.name}</Dialog.Title>
            {file.size && <span className="shrink-0 text-[12px] text-fg-subtle tabular-nums">{file.size}</span>}
            <Button variant="ghost" size="sm" asChild>
              <a href={url} download={file.name}>
                <Download /> Hent
              </a>
            </Button>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Luk">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1">
            {kind === 'image' ? (
              <div className="flex size-full items-center justify-center overflow-auto bg-black/90 p-4">
                <img src={url} alt={file.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : kind === 'video' ? (
              <video src={url} controls autoPlay className="size-full bg-black object-contain" />
            ) : (
              <DocumentView kind={kind} url={url} blob={blob} name={file.name} page />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
