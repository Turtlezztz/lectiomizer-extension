import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Loader2, Send, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLectioAction } from '@/lib/lectio/query';
import { personName } from '@/lib/lectio/readers/thread.js';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { fieldName, keyOf, read, recipientSources, useCompose, useDirectory } from './data';
import { fold, searchDirectory, withSignature } from './model';
import { useSettings } from '@/lib/settings';
import { InlineError, PersonAvatar, errorText } from './parts';
import type { Compose, MessagesData, Recipient } from './types';
import type { Loaded } from '@/lib/lectio/query';

function Header({ onBack, onClose, busy }: { onBack: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <header className="flex items-center gap-2 border-b border-border px-2 py-2.5 sm:px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Tilbage til beskeder" onClick={onBack}>
        <ChevronLeft />
      </Button>
      <h2 className="flex-1 pl-1 text-[15px] font-semibold tracking-[-0.01em] text-fg">Ny besked</h2>
      {busy && <Loader2 className="size-4 animate-spin text-fg-subtle" aria-label="Arbejder" />}
      <Button variant="ghost" size="icon-sm" className="max-lg:hidden" aria-label="Luk ny besked" title="Luk" onClick={onClose}>
        <X />
      </Button>
    </header>
  );
}

export function ComposePane({
  to,
  listUrl,
  lectioHref,
  onBack,
  onSent,
}: {
  to: string | null;
  listUrl: string;
  lectioHref: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const q = useCompose(true, to, listUrl);
  const compose = q.data?.data.compose;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header onBack={onBack} onClose={onBack} busy={q.isFetching && !q.isPending} />
      {q.isPending ? (
        <div className="space-y-4 px-5 py-5" aria-busy="true" aria-label="Indlæser">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : q.error ? (
        <ErrorState className="flex-1" error={q.error} onRetry={() => q.refetch()} href={lectioHref} />
      ) : compose && q.data ? (
        <ComposeForm loaded={q.data} compose={compose} onSent={onSent} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-[13px] text-fg-muted">Beskeden er sendt.</div>
      )}
    </div>
  );
}

function ComposeForm({ loaded, compose, onSent }: { loaded: Loaded<MessagesData>; compose: Compose; onSent: () => void }) {
  const client = useQueryClient();
  const action = useLectioAction(loaded, read);
  const { settings } = useSettings();
  const toRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState(() => compose.subject.value || '');
  const [body, setBody] = useState(() => compose.body.value || '');
  const [noReply, setNoReply] = useState(() => !!compose.noReply?.input.checked);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState<null | { type: 'add'; title: string } | { type: 'remove'; index: number } | { type: 'send' }>(null);
  const [error, setError] = useState('');

  const sources = compose.sources.length ? compose.sources : recipientSources();
  const directory = useDirectory(sources);
  const items = directory.data || [];
  const byTitle = useMemo(() => new Map(items.map((item) => [fold(item.title), item])), [items]);
  const recipients = compose.recipients.map((r) => ({
    ...r,
    id: r.id || byTitle.get(fold(r.full))?.key || '',
  }));
  const skip = (item: Recipient) =>
    compose.me.ids.includes(item.key) ||
    (!!compose.me.name && personName(item.title) === compose.me.name) ||
    recipients.some((r) => (r.id && r.id === item.key) || fold(r.full) === fold(item.title));
  const results = searchDirectory(items, query, skip);
  const listOpen = open && !!query.trim();

  useEffect(() => {
    toRef.current?.focus();
  }, []);

  const keep = () => ({
    [fieldName(compose.subject)]: subject,
    [fieldName(compose.body)]: body,
  });
  const busy = !!pending || action.isPending;

  const add = (item: Recipient) => {
    if (busy) return;
    const before = compose.recipients.length;
    setQuery('');
    setOpen(false);
    setError('');
    setPending({ type: 'add', title: item.title });
    action.mutate(
      {
        element: compose.search.add,
        fields: {
          ...keep(),
          [fieldName(compose.search.input)]: item.title,
          [fieldName(compose.search.id)]: item.key,
        },
      },
      {
        onSuccess: (next) => {
          if ((next.data.compose?.recipients.length ?? 0) <= before)
            setError(`Lectio tilføjede ikke ${personName(item.title)}. Prøv igen, eller skriv beskeden i Lectio.`);
        },
        onError: (e) => setError(errorText(e)),
        onSettled: () => {
          setPending(null);
          toRef.current?.focus();
        },
      },
    );
  };

  const remove = (index: number) => {
    const r = compose.recipients[index];
    if (busy || !r?.remove) return;
    setError('');
    setPending({ type: 'remove', index });
    action.mutate(
      { element: r.remove, fields: keep() },
      {
        onError: (e) => setError(errorText(e)),
        onSettled: () => setPending(null),
      },
    );
  };

  const send = () => {
    if (busy) return;
    const missing: [React.RefObject<HTMLElement | null>, string] | null = !recipients.length
      ? [toRef, 'Tilføj mindst én modtager.']
      : !subject.trim()
        ? [subjectRef, 'Skriv et emne.']
        : !body.trim()
          ? [bodyRef, 'Skriv en besked.']
          : null;
    if (missing) {
      setError(missing[1]);
      missing[0].current?.focus();
      return;
    }
    setError('');
    setPending({ type: 'send' });
    const fields: Record<string, string> = { ...keep(), [fieldName(compose.body)]: withSignature(body, settings.messageSignature) };
    if (noReply && compose.noReply) fields[fieldName(compose.noReply.input)] = 'on';
    action.mutate(
      { element: compose.send, fields },
      {
        onSuccess: (next) => {
          const again = next.data.compose;
          if (again) {
            setError(again.errors.join(' ') || 'Lectio sendte ikke beskeden. Tjek felterne, eller skriv beskeden i Lectio.');
            return;
          }
          client.removeQueries({ queryKey: keyOf(loaded.url), exact: true });
          client.invalidateQueries({
            predicate: (q) => q.queryKey[0] === 'lectio' && /beskeder2\.aspx(\?mappeid=[^&]*)?$/i.test(String(q.queryKey[1])),
          });
          onSent();
        },
        onError: (e) => setError(errorText(e)),
        onSettled: () => setPending(null),
      },
    );
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.max(0, Math.min(results.length - 1, a + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) add(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && recipients.length) {
      remove(recipients.length - 1);
    }
  };

  const subjectLimit = compose.subject.maxLength > 0 ? compose.subject.maxLength : 100;
  const sending = pending?.type === 'send';
  const shownErrors = error || (!pending ? compose.errors.join(' ') : '');

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="border-b border-border">
        {/* To */}
        <div className="relative">
          <div
            className="flex min-h-12 items-start gap-3 px-5 py-2"
            onClick={(e) => {
              if (e.target === e.currentTarget) toRef.current?.focus();
            }}
          >
            <label htmlFor="msg-compose-to" className="w-12 shrink-0 pt-1.5 text-[13px] text-fg-subtle">
              Til
            </label>
            <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-label="Modtagere">
              {recipients.map((r, i) => (
                <li
                  key={`${r.full}-${i}`}
                  title={r.full}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-1 pl-0.5 text-[13px] text-fg ring-1 ring-border',
                    pending?.type === 'remove' && pending.index === i && 'opacity-50',
                  )}
                >
                  <PersonAvatar id={r.id} name={r.name} size={22} />
                  <span className="max-w-[180px] truncate">{r.name}</span>
                  {r.remove && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Fjern ${r.name}`}
                      onClick={() => remove(i)}
                      className="flex size-5 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
              {pending?.type === 'add' && (
                <li className="inline-flex h-7 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-[13px] text-accent-soft-fg">
                  <Loader2 className="size-3.5 animate-spin" /> {personName(pending.title)}
                </li>
              )}
              <li className="min-w-[140px] flex-1">
                <input
                  ref={toRef}
                  id="msg-compose-to"
                  type="text"
                  autoComplete="off"
                  value={query}
                  disabled={sending}
                  placeholder={recipients.length ? 'Tilføj flere …' : 'Lærer, elev, klasse eller hold'}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={listOpen}
                  aria-controls="msg-compose-results"
                  aria-activedescendant={listOpen && results[active] ? `msg-compose-result-${active}` : undefined}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setActive(0);
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setOpen(false)}
                  onKeyDown={onSearchKey}
                  className="h-8 w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
                />
              </li>
            </ul>
          </div>
          {listOpen && (
            <ul
              id="msg-compose-results"
              role="listbox"
              aria-label="Forslag"
              className="absolute inset-x-3 top-[calc(100%+2px)] z-20 max-h-[320px] animate-pop overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop sm:left-[84px] sm:right-auto sm:w-[380px]"
            >
              {directory.isPending ? (
                <li className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-fg-muted">
                  <Loader2 className="size-4 animate-spin" /> Henter modtagere …
                </li>
              ) : directory.error || !sources.length ? (
                <li className="px-3 py-2.5 text-[13px] text-fg-muted">Modtagerne kunne ikke hentes. Skriv beskeden i Lectio for at vælge dem.</li>
              ) : results.length ? (
                results.map((item, i) => (
                  <li
                    key={item.key}
                    id={`msg-compose-result-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(item);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn('flex cursor-default items-center gap-2.5 rounded-lg px-2 py-1.5', i === active && 'bg-surface-2')}
                  >
                    <PersonAvatar id={item.key} name={personName(item.title)} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-fg">{item.title}</span>
                      {item.kind && <span className="block text-[11.5px] text-fg-subtle">{item.kind}</span>}
                    </span>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2.5 text-[13px] text-fg-muted">Ingen modtagere matcher „{query.trim()}“.</li>
              )}
            </ul>
          )}
        </div>
        {/* Subject */}
        <div className="flex h-12 items-center gap-3 border-t border-border px-5">
          <label htmlFor="msg-compose-subject" className="w-12 shrink-0 text-[13px] text-fg-subtle">
            Emne
          </label>
          <input
            ref={subjectRef}
            id="msg-compose-subject"
            type="text"
            value={subject}
            maxLength={subjectLimit}
            disabled={sending}
            onChange={(e) => {
              setSubject(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                bodyRef.current?.focus();
              }
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-medium text-fg outline-none placeholder:text-fg-subtle"
            placeholder="Hvad handler det om?"
          />
          {subject.length > subjectLimit - 20 && (
            <span className="text-[12px] text-fg-subtle tabular-nums">
              {subject.length}/{subjectLimit}
            </span>
          )}
        </div>
      </div>
      {/* Body */}
      <textarea
        ref={bodyRef}
        value={body}
        disabled={sending}
        aria-label="Besked"
        placeholder="Skriv din besked …"
        maxLength={compose.body.maxLength > 0 ? compose.body.maxLength : undefined}
        onChange={(e) => {
          setBody(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        className="min-h-[160px] flex-1 resize-none bg-transparent px-5 py-4 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle disabled:opacity-60"
      />
      {/* Footer */}
      <div className="space-y-2 border-t border-border px-4 py-3">
        {shownErrors && <InlineError>{shownErrors}</InlineError>}
        <div className="flex flex-wrap items-center gap-3">
          {compose.noReply && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-muted select-none">
              <input type="checkbox" checked={noReply} onChange={(e) => setNoReply(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
              {compose.noReply.label}
            </label>
          )}
          <span className="flex-1" />
          <span className="hidden text-[11.5px] text-fg-subtle sm:inline">⌘/Ctrl + Enter sender</span>
          <Button type="submit" variant="primary" disabled={busy}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />} {sending ? 'Sender …' : 'Send'}
          </Button>
        </div>
      </div>
    </form>
  );
}
