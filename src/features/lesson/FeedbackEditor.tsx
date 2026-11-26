// Rich-text editor for the student's own elevfeedback paper. It mirrors the
// writing tools of Lectio's own editor (CKEditor): text formats, inline styles,
// colours, alignment, lists, indent, quotes, links, tables, images and attached
// files. Images and files are uploaded to Lectio straight away (as Lectio does
// on paste/drop) and referenced from the HTML; the document itself is only
// saved when the student presses Gem.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, ChevronDown, Highlighter, ImagePlus, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered,
  LoaderCircle, Paperclip, Quote, Redo2, RemoveFormatting, Strikethrough, Subscript, Superscript, Table, Undo2, Unlink,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { UploadedEditorFile } from '@/lib/lectio/client';
import { fileLinkHtml, imageHtml, tableHtml, toAbsolute } from './feedback-html';

export interface FeedbackEditorHandle {
  getHtml(): string;
  focus(): void;
}

interface Props {
  /** Initial HTML (already converted with toEditorHtml). Changing `resetKey` reloads it. */
  html: string;
  resetKey: string | number;
  disabled?: boolean;
  placeholder?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onUpload: (file: File) => Promise<UploadedEditorFile>;
  onSave?: () => void;
  className?: string;
}

/** Lectio's CKEditor colour palette. */
const COLORS = ['1ABC9C', '2ECC71', '3498DB', '9B59B6', '4E5F70', 'F1C40F', '16A085', '27AE60', '2980B9', '8E44AD', '2C3E50', 'F39C12', 'E67E22', 'E74C3C', 'ECF0F1', '95A5A6', 'DDDDDD', 'FFFFFF', 'D35400', 'C0392B', 'BDC3C7', '7F8C8D', '999999', '000000'];

const FORMATS = [
  { tag: 'p', label: 'Brødtekst' },
  { tag: 'h1', label: 'Overskrift 1' },
  { tag: 'h2', label: 'Overskrift 2' },
  { tag: 'h3', label: 'Overskrift 3' },
] as const;

type Popover = null | 'format' | 'color' | 'highlight' | 'link' | 'table';

interface ToolState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
  ul: boolean;
  ol: boolean;
  quote: boolean;
  link: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  block: string;
}

const EMPTY_STATE: ToolState = { bold: false, italic: false, strike: false, sub: false, sup: false, ul: false, ol: false, quote: false, link: false, align: 'left', block: 'p' };
const BLOCK_SELECTOR = 'p, h1, h2, h3, li, blockquote, td, th';

const imageSize = (src: string) =>
  new Promise<{ width: number; height: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });

export const FeedbackEditor = forwardRef<FeedbackEditorHandle, Props>(function FeedbackEditor({ html, resetKey, disabled, placeholder, onDirtyChange, onUpload, onSave, className }, ref) {
  const area = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const initial = useRef('');
  const [state, setState] = useState<ToolState>(EMPTY_STATE);
  const [popover, setPopover] = useState<Popover>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploads, setUploads] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const toolbar = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    getHtml: () => area.current?.innerHTML ?? '',
    focus: () => area.current?.focus(),
  }));

  const checkEmpty = useCallback(() => {
    const el = area.current;
    if (!el) return;
    setEmpty(!el.textContent?.replace(/ /g, '').trim() && !el.querySelector('img, table'));
  }, []);

  // Load content.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.innerHTML = html || '<p><br></p>';
    initial.current = el.innerHTML;
    onDirtyChange?.(false);
    checkEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const changed = useCallback(() => {
    const el = area.current;
    if (!el) return;
    onDirtyChange?.(el.innerHTML !== initial.current);
    checkEmpty();
  }, [onDirtyChange, checkEmpty]);

  // ------------------------------------------------------------ selection

  const inEditor = (node: Node | null) => !!node && !!area.current?.contains(node);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && inEditor(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const el = area.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (saved.current && inEditor(saved.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    } else if (!sel.rangeCount || !inEditor(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const currentBlock = (): HTMLElement | null => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node || !inEditor(node)) return null;
    const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
    const block = el?.closest(BLOCK_SELECTOR) as HTMLElement | null;
    return block && inEditor(block) ? block : null;
  };

  const refreshState = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !area.current?.contains(sel.anchorNode)) return;
    saved.current = sel.getRangeAt(0).cloneRange();
    const q = (cmd: string) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    const node = sel.anchorNode;
    const el = (node && (node.nodeType === 1 ? node : node.parentElement)) as HTMLElement | null;
    const block = el?.closest('p, h1, h2, h3, li, td, th') as HTMLElement | null;
    const alignSource = (el?.closest('p, h1, h2, h3, li, td, th, blockquote') as HTMLElement | null) ?? null;
    const align = (alignSource?.style.textAlign || 'left') as ToolState['align'];
    setState({
      bold: q('bold'),
      italic: q('italic'),
      strike: q('strikeThrough'),
      sub: q('subscript'),
      sup: q('superscript'),
      ul: q('insertUnorderedList'),
      ol: q('insertOrderedList'),
      quote: !!el?.closest('blockquote'),
      link: !!el?.closest('a'),
      align: ['left', 'center', 'right', 'justify'].includes(align) ? align : 'left',
      block: block && /^H[1-3]$/.test(block.tagName) ? block.tagName.toLowerCase() : 'p',
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshState);
    return () => document.removeEventListener('selectionchange', refreshState);
  }, [refreshState]);

  // ------------------------------------------------------------ commands

  const exec = (command: string, value?: string, css = false) => {
    restoreSelection();
    document.execCommand('styleWithCSS', false, String(css));
    document.execCommand(command, false, value);
    document.execCommand('styleWithCSS', false, 'false');
    saveSelection();
    changed();
    refreshState();
  };

  const insertHtml = (markup: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, markup);
    saveSelection();
    changed();
  };

  const setFormat = (tag: string) => {
    exec('formatBlock', `<${tag}>`);
    setPopover(null);
  };

  const toggleQuote = () => {
    restoreSelection();
    const quote = currentBlock()?.closest('blockquote');
    if (quote) {
      // Unwrap: keep the paragraphs, drop the quote.
      const parent = quote.parentNode!;
      if (!quote.querySelector('p, h1, h2, h3, ul, ol')) {
        const p = document.createElement('p');
        while (quote.firstChild) p.appendChild(quote.firstChild);
        parent.replaceChild(p, quote);
      } else {
        while (quote.firstChild) parent.insertBefore(quote.firstChild, quote);
        quote.remove();
      }
      changed();
      refreshState();
    } else exec('formatBlock', '<blockquote>');
  };

  /** Indent like CKEditor's indentblock plugin: nested lists, else 40px margin steps on the block. */
  const indent = (dir: 1 | -1) => {
    restoreSelection();
    const block = currentBlock();
    if (block?.closest('li')) {
      exec(dir > 0 ? 'indent' : 'outdent');
      return;
    }
    const target = block && !/^(TD|TH)$/.test(block.tagName) ? block : null;
    if (!target) return;
    const next = Math.max(0, (parseFloat(target.style.marginLeft) || 0) + dir * 40);
    target.style.marginLeft = next ? `${next}px` : '';
    if (!target.getAttribute('style')) target.removeAttribute('style');
    changed();
  };

  const align = (value: ToolState['align']) => {
    const map = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' } as const;
    exec(map[value], undefined, true);
  };

  const openLink = () => {
    saveSelection();
    const anchor = (window.getSelection()?.anchorNode?.parentElement?.closest('a') as HTMLAnchorElement | null) ?? null;
    setLinkUrl(anchor && inEditor(anchor) ? anchor.getAttribute('href') || '' : '');
    setPopover(popover === 'link' ? null : 'link');
  };

  const applyLink = () => {
    let url = linkUrl.trim();
    setPopover(null);
    if (!url) return;
    if (!/^(https?:|mailto:|\/)/i.test(url)) url = `https://${url}`;
    restoreSelection();
    const sel = window.getSelection();
    const anchor = sel?.anchorNode?.parentElement?.closest('a');
    if (anchor && inEditor(anchor)) {
      anchor.setAttribute('href', url);
      changed();
    } else if (sel && sel.isCollapsed) {
      insertHtml(`<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>&nbsp;`);
    } else exec('createLink', url);
  };

  const removeLink = () => {
    restoreSelection();
    const anchor = window.getSelection()?.anchorNode?.parentElement?.closest('a');
    if (anchor && inEditor(anchor)) {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    }
    exec('unlink');
    setPopover(null);
  };

  // ------------------------------------------------------------ uploads

  const upload = async (files: File[], kind: 'image' | 'file') => {
    if (!files.length) return;
    saveSelection();
    setUploadError(null);
    for (const file of files) {
      setUploads((u) => [...u, file.name]);
      try {
        const res = await onUpload(file);
        const asImage = kind === 'image' || /^image\/(png|jpe?g|gif)$/i.test(file.type);
        if (asImage) {
          const size = await imageSize(toAbsolute(res.url));
          insertHtml(`<p>${imageHtml(res.url, size?.width, size?.height)}</p>`);
        } else insertHtml(fileLinkHtml(res.url, res.fileName));
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : `Kunne ikke uploade ${file.name}`);
      } finally {
        setUploads((u) => {
          const i = u.indexOf(file.name);
          return i < 0 ? u : [...u.slice(0, i), ...u.slice(i + 1)];
        });
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      upload(files, 'file');
      return;
    }
    // Keep pasted formatting but run it through the same clean-up on save;
    // plain text paste is handled natively.
  };

  const onDrop = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    e.preventDefault();
    // Put the caret where the files were dropped.
    const pos = (document as any).caretRangeFromPoint?.(e.clientX, e.clientY) as Range | undefined;
    if (pos && inEditor(pos.startContainer)) saved.current = pos;
    upload(files, 'file');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSave?.();
    } else if (mod && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      exec('strikeThrough');
    } else if (e.key === 'Tab' && currentBlock()?.closest('li')) {
      e.preventDefault();
      exec(e.shiftKey ? 'outdent' : 'indent');
    } else if (e.key === 'Escape') setPopover(null);
  };

  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }, []);

  // Close popovers on outside click.
  useEffect(() => {
    if (!popover) return;
    const onDown = (e: MouseEvent) => {
      if (!toolbar.current?.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popover]);

  // ------------------------------------------------------------ render

  const busy = uploads.length > 0;
  const formatLabel = FORMATS.find((f) => f.tag === state.block)?.label ?? 'Brødtekst';

  return (
    <div className={cn('rounded-xl border border-border bg-surface shadow-card focus-within:border-border-strong', disabled && 'pointer-events-none opacity-60', className)}>
      <div
        ref={toolbar}
        role="toolbar"
        aria-label="Formatering"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-border bg-surface/95 px-1.5 py-1.5 backdrop-blur"
        onMouseDown={(e) => {
          // Keep the text selection when clicking toolbar buttons.
          if ((e.target as HTMLElement).closest('button')) e.preventDefault();
        }}
      >
        <Tool label="Fortryd (Ctrl+Z)" onClick={() => exec('undo')}><Undo2 /></Tool>
        <Tool label="Gentag (Ctrl+Y)" onClick={() => exec('redo')}><Redo2 /></Tool>
        <Sep />
        <div className="relative">
          <button
            type="button"
            className="flex h-8 w-[124px] items-center justify-between gap-1 rounded-md px-2 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-haspopup="listbox"
            aria-expanded={popover === 'format'}
            onClick={() => {
              saveSelection();
              setPopover(popover === 'format' ? null : 'format');
            }}
          >
            <span className="truncate">{formatLabel}</span>
            <ChevronDown className="size-3.5 shrink-0" />
          </button>
          {popover === 'format' && (
            <Pop className="w-48 p-1">
              {FORMATS.map((f) => (
                <button
                  key={f.tag}
                  type="button"
                  role="option"
                  aria-selected={state.block === f.tag}
                  className={cn('flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-fg hover:bg-surface-2', state.block === f.tag && 'bg-surface-2', f.tag === 'h1' ? 'text-[18px] font-semibold' : f.tag === 'h2' ? 'text-[16px] font-semibold' : f.tag === 'h3' ? 'text-[14.5px] font-semibold' : 'text-[13.5px]')}
                  onClick={() => setFormat(f.tag)}
                >
                  {f.label}
                </button>
              ))}
            </Pop>
          )}
        </div>
        <Sep />
        <Tool label="Fed (Ctrl+B)" active={state.bold} onClick={() => exec('bold')}><Bold /></Tool>
        <Tool label="Kursiv (Ctrl+I)" active={state.italic} onClick={() => exec('italic')}><Italic /></Tool>
        <Tool label="Gennemstreget (Ctrl+Shift+X)" active={state.strike} onClick={() => exec('strikeThrough')}><Strikethrough /></Tool>
        <Tool label="Sænket skrift" active={state.sub} onClick={() => exec('subscript')} className="hidden sm:flex"><Subscript /></Tool>
        <Tool label="Hævet skrift" active={state.sup} onClick={() => exec('superscript')} className="hidden sm:flex"><Superscript /></Tool>
        <div className="relative">
          <Tool label="Tekstfarve" active={popover === 'color'} onClick={() => { saveSelection(); setPopover(popover === 'color' ? null : 'color'); }}><Baseline /></Tool>
          {popover === 'color' && <ColorPop onPick={(c) => { setPopover(null); exec('foreColor', c, true); }} onReset={() => { setPopover(null); exec('foreColor', 'inherit', true); }} resetLabel="Automatisk" />}
        </div>
        <div className="relative">
          <Tool label="Baggrundsfarve" active={popover === 'highlight'} onClick={() => { saveSelection(); setPopover(popover === 'highlight' ? null : 'highlight'); }}><Highlighter /></Tool>
          {popover === 'highlight' && <ColorPop onPick={(c) => { setPopover(null); exec('hiliteColor', c, true); }} onReset={() => { setPopover(null); exec('hiliteColor', 'transparent', true); }} resetLabel="Ingen farve" />}
        </div>
        <Tool label="Fjern formatering" onClick={() => exec('removeFormat')}><RemoveFormatting /></Tool>
        <Sep />
        <Tool label="Venstrestil" active={state.align === 'left'} onClick={() => align('left')} className="hidden md:flex"><AlignLeft /></Tool>
        <Tool label="Centrér" active={state.align === 'center'} onClick={() => align('center')}><AlignCenter /></Tool>
        <Tool label="Højrestil" active={state.align === 'right'} onClick={() => align('right')} className="hidden md:flex"><AlignRight /></Tool>
        <Tool label="Lige margener" active={state.align === 'justify'} onClick={() => align('justify')} className="hidden md:flex"><AlignJustify /></Tool>
        <Sep />
        <Tool label="Punktliste" active={state.ul} onClick={() => exec('insertUnorderedList')}><List /></Tool>
        <Tool label="Nummereret liste" active={state.ol} onClick={() => exec('insertOrderedList')}><ListOrdered /></Tool>
        <Tool label="Formindsk indrykning" onClick={() => indent(-1)}><IndentDecrease /></Tool>
        <Tool label="Forøg indrykning" onClick={() => indent(1)}><IndentIncrease /></Tool>
        <Tool label="Citat" active={state.quote} onClick={toggleQuote}><Quote /></Tool>
        <Sep />
        <div className="relative">
          <Tool label="Link" active={state.link || popover === 'link'} onClick={openLink}><Link2 /></Tool>
          {popover === 'link' && (
            <Pop className="w-72 p-2">
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyLink();
                }}
              >
                <input
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  aria-label="Linkadresse"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[13px] text-fg outline-none focus:border-accent"
                />
                <button type="submit" className="h-8 rounded-md bg-accent px-2.5 text-[12.5px] font-medium text-accent-fg hover:bg-accent-hover">OK</button>
                {state.link && (
                  <button type="button" title="Fjern link" aria-label="Fjern link" className="flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" onMouseDown={(e) => e.preventDefault()} onClick={removeLink}>
                    <Unlink className="size-4" />
                  </button>
                )}
              </form>
            </Pop>
          )}
        </div>
        <div className="relative">
          <Tool label="Indsæt tabel" active={popover === 'table'} onClick={() => { saveSelection(); setPopover(popover === 'table' ? null : 'table'); }}><Table /></Tool>
          {popover === 'table' && <TablePop onPick={(r, c) => { setPopover(null); insertHtml(tableHtml(r, c)); }} />}
        </div>
        <Tool label="Indsæt billede" onClick={() => { saveSelection(); imageInput.current?.click(); }}><ImagePlus /></Tool>
        <Tool label="Vedhæft fil" onClick={() => { saveSelection(); fileInput.current?.click(); }}><Paperclip /></Tool>
        <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif" multiple hidden onChange={(e) => { upload(Array.from(e.target.files || []), 'image'); e.target.value = ''; }} />
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { upload(Array.from(e.target.files || []), 'file'); e.target.value = ''; }} />
        {busy && (
          <span className="ml-auto flex items-center gap-1.5 pr-1.5 text-[12px] text-fg-muted" role="status">
            <LoaderCircle className="size-3.5 animate-spin" /> Uploader {uploads[0]}{uploads.length > 1 ? ` (+${uploads.length - 1})` : ''}
          </span>
        )}
      </div>
      {uploadError && (
        <p role="alert" className="border-b border-border bg-danger-soft px-4 py-2 text-[12.5px] text-danger-soft-fg">{uploadError}</p>
      )}
      <div className="relative">
        {empty && placeholder && <p aria-hidden className="pointer-events-none absolute top-4 left-5 text-[14.5px] text-fg-subtle">{placeholder}</p>}
        <div
          ref={area}
          role="textbox"
          aria-multiline="true"
          aria-label="Din elevfeedback"
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck
          lang="da"
          className="prose-lectio prose-editor min-h-[280px] px-5 py-3 outline-none"
          onInput={changed}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={onDrop}
          onFocus={() => setPopover(null)}
          onBlur={saveSelection}
        />
      </div>
    </div>
  );
});

function Tool({ label, active, onClick, children, className }: { label: string; active?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:size-4',
        active && 'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft hover:text-accent-soft-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span aria-hidden className="mx-1 h-5 w-px bg-border" />;

function Pop({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('absolute top-full left-0 z-20 mt-1 rounded-lg border border-border bg-surface shadow-lg', className)}>{children}</div>;
}

function ColorPop({ onPick, onReset, resetLabel }: { onPick: (c: string) => void; onReset: () => void; resetLabel: string }) {
  return (
    <Pop className="w-[200px] p-2">
      <button type="button" className="mb-2 w-full rounded-md border border-border px-2 py-1 text-left text-[12.5px] text-fg-muted hover:bg-surface-2 hover:text-fg" onClick={onReset}>{resetLabel}</button>
      <div className="grid grid-cols-6 gap-1.5">
        {COLORS.map((c) => (
          <button key={c} type="button" title={`#${c}`} aria-label={`Farve #${c}`} className="size-6 rounded-md border border-black/10 transition-transform hover:scale-110" style={{ background: `#${c}` }} onClick={() => onPick(`#${c}`)} />
        ))}
      </div>
    </Pop>
  );
}

function TablePop({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<[number, number]>([2, 2]);
  return (
    <Pop className="p-2.5">
      <div className="grid grid-cols-6 gap-1" onMouseLeave={() => setHover([2, 2])}>
        {Array.from({ length: 36 }, (_, i) => {
          const r = Math.floor(i / 6) + 1;
          const c = (i % 6) + 1;
          const on = r <= hover[0] && c <= hover[1];
          return (
            <button key={i} type="button" aria-label={`${r} × ${c}`} className={cn('size-5 rounded-[4px] border', on ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2')} onMouseEnter={() => setHover([r, c])} onFocus={() => setHover([r, c])} onClick={() => onPick(r, c)} />
          );
        })}
      </div>
      <p className="mt-2 text-center text-[12px] text-fg-muted tabular-nums">{hover[0]} × {hover[1]}</p>
    </Pop>
  );
}
