import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  FileText,
  Flag,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Reply,
  SquarePen,
  Trash2,
  Users,
} from 'lucide-react';
import { useLectioAction } from '@/lib/lectio/query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { cn } from '@/lib/cn';
import { fmtLongDate, fmtTime } from '@/lib/format';
import { fieldName, read, useLectioChain, useThread } from './data';
import { groupThread, hasPhoto, listNames, ownTitle, timeOf } from './model';
import { InlineError, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, PersonAvatar, errorText, touchScreen, useAutoGrow } from './parts';
import type { Person, RecipientGroup, Thread, ThreadMessage } from './types';
import { AttachmentView } from './AttachmentView';
import { embedsIn } from '@/components/embeds';
import { EmbedView } from '@/components/LinkEmbeds';
import { Person as PersonLink } from '@/features/people/PersonPopover';

const MENU_ICONS: Record<string, typeof Pencil> = {
  edit: Pencil,
  add: Plus,
  flag: Flag,
  document_scanner: FileText,
  print: Printer,
  delete: Trash2,
  reply: Reply,
};

export function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Indlæser tråd">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <div className="flex-1 space-y-5 px-5 py-6">
        {['w-[60%]', 'w-[40%]', 'w-[55%]', 'w-[35%]'].map((w, i) => (
          <div key={i} className={cn('flex items-end gap-2', i === 2 && 'justify-end')}>
            {i !== 2 && <Skeleton className="size-7 rounded-full" />}
            <Skeleton className={cn('h-14 rounded-2xl', w)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message, subject, own, first }: { message: ThreadMessage; subject: string; own: boolean; first: boolean }) {
  const title = ownTitle(message.title, subject);
  const hasText = !!message.content && (!!message.content.textContent?.trim() || !!message.content.querySelector('img'));
  const when = message.date ? `${fmtLongDate(message.date)} kl. ${fmtTime(message.date)}` : message.stamp;
  // Videos, pictures and Lectio files the text links to, shown like attachments.
  const embeds = useMemo(() => embedsIn(message.content, { skip: message.attachments.map((f) => f.href) }), [message]);
  return (
    <div className={cn('flex max-w-full flex-col gap-1', own ? 'items-end' : 'items-start')}>
      {(hasText || title) && (
        <div
          title={when}
          className={cn(
            'max-w-full rounded-[18px] px-3.5 py-2 text-[14px] leading-relaxed shadow-card',
            own ? 'bg-accent text-accent-fg' : 'border border-border bg-surface text-fg',
            own ? 'rounded-br-md' : 'rounded-bl-md',
            !first && (own ? 'rounded-tr-md' : 'rounded-tl-md'),
          )}
        >
          {title && <div className={cn('mb-0.5 text-[13px] font-semibold', own ? 'text-accent-fg' : 'text-fg')}>{title}</div>}
          {hasText && (
            <RichText
              node={message.content}
              className={cn(
                '[&_p:first-child]:mt-0 [&_p:last-child]:mb-0 text-[14px]!',
                own && 'text-accent-fg! [&_a]:text-accent-fg! [&_a]:decoration-current/60 [&_blockquote]:border-current/40 [&_blockquote]:text-current/80',
              )}
            />
          )}
        </div>
      )}
      {(message.attachments.length > 0 || embeds.length > 0) && (
        <div className={cn('flex w-full max-w-full flex-col gap-1.5', own ? 'items-end' : 'items-start')}>
          {message.attachments.map((file) => (
            <AttachmentView key={file.href} file={file} />
          ))}
          {embeds.map((embed) => (
            <EmbedView key={embed.href} embed={embed} />
          ))}
        </div>
      )}
    </div>
  );
}

const personKey = (p: Person) => p.id || p.full;

function PeopleRow({
  label,
  people,
  groups = [],
  photoOf,
}: {
  label: string;
  people: Person[];
  groups?: RecipientGroup[];
  photoOf: (p: Person) => string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-14 shrink-0 pt-1 text-fg-subtle">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {groups.map((g) => (
          <span key={g.full} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-fg" title={g.full}>
            <span aria-hidden className="inline-flex size-[22px] items-center justify-center rounded-full bg-surface-3 text-fg-muted">
              <Users className="size-3" />
            </span>
            {g.name}
            {g.kind && <span className="text-fg-subtle">{g.kind.toLowerCase()}</span>}
          </span>
        ))}
        {people.map((p) => (
          <span key={personKey(p)} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-fg" title={p.full}>
            <PersonAvatar id={p.id} name={p.name} photo={photoOf(p)} size={22} />
            {p.own ? p.name : <PersonLink person={p}>{p.name}</PersonLink>}
            {p.own && <span className="text-fg-subtle">(dig)</span>}
          </span>
        ))}
      </dd>
    </div>
  );
}

export function ThreadPane({
  id,
  listUrl,
  lectioHref,
  onBack,
  onDeleted,
  onWrite,
}: {
  id: string;
  listUrl: string;
  lectioHref: string;
  onBack: () => void;
  onDeleted: () => void;
  onWrite: (to: string) => void;
}) {
  const q = useThread(id, listUrl);
  if (q.isPending) return <ThreadSkeleton />;
  if (q.error || !q.data?.data.thread) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center border-b border-border px-3 py-2 lg:hidden">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft /> Beskeder
          </Button>
        </div>
        <ErrorState className="flex-1" error={q.error ?? new Error('Tråden kunne ikke læses')} onRetry={() => q.refetch()} href={lectioHref} />
      </div>
    );
  }
  return <ThreadView loaded={q.data} thread={q.data.data.thread} lectioHref={lectioHref} onBack={onBack} onDeleted={onDeleted} onWrite={onWrite} />;
}

function ThreadView({
  loaded,
  thread,
  lectioHref,
  onBack,
  onDeleted,
  onWrite,
}: {
  loaded: NonNullable<ReturnType<typeof useThread>['data']>;
  thread: Thread;
  lectioHref: string;
  onBack: () => void;
  onDeleted: () => void;
  onWrite: (to: string) => void;
}) {
  const action = useLectioAction(loaded, read);
  const chain = useLectioChain(loaded);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState('');
  const [peopleOpen, setPeopleOpen] = useState(false);
  useAutoGrow(field, draft);

  // Everyone once: the recipients, then anyone else who wrote.
  const people = useMemo(() => {
    const out: Person[] = [];
    for (const p of [...thread.recipients, ...thread.messages.map((m) => ({ ...m.sender, own: m.own }))]) {
      if (!out.some((q) => personKey(q) === personKey(p))) out.push(p);
    }
    return out;
  }, [thread]);
  // Who the thread is for: Lectio lists the starter among the recipients, so
  // leave them out unless they are the only one.
  const starter = thread.messages[0].sender;
  const to = useMemo(() => {
    const named = thread.recipients.filter((p) => personKey(p) !== personKey(starter));
    return { people: named, groups: thread.groups ?? [] };
  }, [thread, starter]);
  const toNames = [...to.groups.map((g) => g.name), ...to.people.map((p) => (p.own ? 'dig' : p.name))];
  const wrote = people.filter((p) => personKey(p) !== personKey(starter) && !to.people.some((q) => personKey(q) === personKey(p)));
  const others = people.filter((p) => !p.own);
  const group = others.length > 1;
  const items = useMemo(() => groupThread(thread.messages), [thread]);
  const photoOf = (p: Person) => (p.own ? thread.me.photo : null);

  // Open at the newest message and follow new ones while the reader is at the bottom.
  useLayoutEffect(() => {
    const el = log.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const follow = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    };
    el.addEventListener('load', follow, true);
    return () => el.removeEventListener('load', follow, true);
  }, []);

  const canReply = !!thread.reply || !!thread.actions.reply;
  const send = () => {
    const text = draft.trim();
    if (!text || sending || !canReply) return;
    const before = thread.messages.length;
    setSendError('');
    setSending(text);
    pinned.current = true;
    // Lectio's reply row may first need "Besvar"; then fill it and press Send.
    const steps: Parameters<typeof chain.mutate>[0] = [];
    if (!thread.reply) steps.push((page) => ({ element: page.data.thread?.actions.reply }));
    steps.push((page) => {
      const reply = page.data.thread?.reply;
      if (!reply) throw new Error('Lectio åbnede ikke svarfeltet.');
      const fields: Record<string, string> = { [fieldName(reply.body)]: draft };
      if (reply.title && !reply.title.value.trim() && fieldName(reply.title)) fields[fieldName(reply.title)] = `Re: ${thread.subject}`;
      return { element: reply.send, fields };
    });
    chain.mutate(steps, {
      onSuccess: (next) => {
        setSending(null);
        const after = next.data.thread?.messages.length ?? 0;
        const echoed = next.data.thread?.reply?.body.value?.trim();
        if (after > before || (next.data.thread && !echoed)) {
          setDraft('');
          if (!touchScreen()) requestAnimationFrame(() => field.current?.focus());
        } else {
          setSendError('Lectio bekræftede ikke beskeden. Tjek tråden i Lectio, før du prøver igen.');
        }
      },
      onError: (error) => {
        setSending(null);
        setSendError(errorText(error));
      },
    });
  };

  const menu = thread.actions.menu.filter((item) => !(item.icon === 'flag' && thread.actions.flag) && item.icon !== 'edit');
  const deleteItem = menu.find((item) => item.icon === 'delete');
  const runMenu = (source: Element, deletes: boolean) =>
    action.mutate(
      { element: source },
      {
        onSuccess: (next) => {
          if (deletes || !next.data.thread) onDeleted();
        },
      },
    );

  const faces = (others.length ? others : people).slice(0, 3);
  const firstName = others.length === 1 ? others[0].name.split(' ')[0] : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="relative z-10 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="flex items-center gap-2 px-2 py-2.5 sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Tilbage til beskeder" onClick={onBack}>
            <ChevronLeft />
          </Button>
          <div className={cn('flex shrink-0', faces.length > 1 && '-space-x-2.5')}>
            {faces.map((p) => (
              <PersonAvatar
                key={personKey(p)}
                id={p.id}
                name={p.name}
                photo={photoOf(p)}
                size={faces.length > 1 ? 30 : 36}
                className={faces.length > 1 ? 'ring-2 ring-bg' : ''}
              />
            ))}
          </div>
          <div className="min-w-0 flex-1 pl-1">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-fg">{thread.subject}</h2>
            <button
              type="button"
              aria-expanded={peopleOpen}
              onClick={() => setPeopleOpen((o) => !o)}
              className="flex max-w-full items-center gap-1 text-[12.5px] text-fg-muted hover:text-fg"
            >
              <span className="truncate">
                {toNames.length ? (
                  <>
                    <span className="text-fg-subtle">Til </span>
                    {listNames(toNames)}
                  </>
                ) : others.length ? (
                  listNames(others.map((p) => p.name))
                ) : (
                  thread.recipientsText || 'Kun dig'
                )}
              </span>
              <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', peopleOpen && 'rotate-180')} />
            </button>
          </div>
          {thread.actions.flag && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={thread.actions.flagged}
              aria-label={thread.actions.flagged ? 'Fjern flag' : 'Flag tråden'}
              title={thread.actions.flagged ? 'Fjern flag' : 'Flag tråden'}
              disabled={action.isPending}
              onClick={() => action.mutate({ element: thread.actions.flag })}
            >
              <Flag className={cn(thread.actions.flagged && 'fill-warning text-warning')} />
            </Button>
          )}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Flere handlinger" disabled={action.isPending}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {menu
                .filter((item) => item !== deleteItem)
                .map((item, i) => {
                  const Icon = MENU_ICONS[item.icon];
                  return (
                    <MenuItem key={i} onSelect={() => runMenu(item.source, false)}>
                      {Icon ? <Icon /> : <span className="size-4" />} {item.label}
                    </MenuItem>
                  );
                })}
              <MenuItem asChild>
                <a href={lectioHref} target="_blank" rel="noreferrer">
                  <ExternalLink /> Åbn i Lectio
                </a>
              </MenuItem>
              {deleteItem && (
                <>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => runMenu(deleteItem.source, true)}>
                    <Trash2 /> {deleteItem.label}
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
        {peopleOpen && (
          <dl className="max-h-56 space-y-2 overflow-y-auto border-t border-border px-4 py-3 text-[12.5px] animate-in" aria-label="Deltagere">
            <PeopleRow label="Fra" people={[{ ...starter, own: thread.messages[0].own }]} photoOf={photoOf} />
            {(to.groups.length > 0 || to.people.length > 0) && (
              <PeopleRow label="Til" people={to.people} groups={to.groups} photoOf={photoOf} />
            )}
            {wrote.length > 0 && <PeopleRow label="Svar fra" people={wrote} photoOf={photoOf} />}
          </dl>
        )}
        {action.error && (
          <div className="px-4 pb-3">
            <InlineError>{errorText(action.error)}</InlineError>
          </div>
        )}
      </header>

      {/* Conversation */}
      <div
        ref={log}
        role="log"
        aria-label="Beskeder i tråden"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
      >
        <div className="mx-auto flex max-w-[760px] flex-col gap-3">
          {items.map((item) =>
            item.type === 'day' ? (
              <div key={item.key} className="my-2 flex items-center gap-3 text-[11.5px] font-medium text-fg-subtle">
                <span className="h-px flex-1 bg-border" />
                {item.label}
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <div key={item.key} className={cn('group/run flex items-end gap-2', item.own && 'justify-end')}>
                {!item.own && (
                  <PersonLink person={item.messages[0].sender} className="mb-0.5 shrink-0 rounded-full">
                    <PersonAvatar id={item.messages[0].sender.id} name={item.messages[0].sender.name} size={28} />
                  </PersonLink>
                )}
                <div className={cn('flex min-w-0 max-w-[min(85%,560px)] flex-col gap-1', item.own ? 'items-end' : 'items-start', item.messages.some((m) => m.attachments.length > 0) && 'w-full')}>
                  <div className={cn('flex items-baseline gap-2 px-1 text-[12px]', item.own && 'flex-row-reverse')}>
                    {!item.own && (
                      <PersonLink person={item.messages[0].sender} title={item.messages[0].sender.full} className="font-medium text-fg-muted">
                        {item.messages[0].sender.name}
                      </PersonLink>
                    )}
                    <span className="text-fg-subtle tabular-nums">{timeOf(item.messages[0])}</span>
                    {!item.own && hasPhoto(item.messages[0].sender.id) && (group || !canReply) && (
                      <button
                        type="button"
                        onClick={() => onWrite(item.messages[0].sender.id)}
                        className="text-fg-subtle opacity-0 transition-opacity group-hover/run:opacity-100 hover:text-accent-soft-fg [@media(hover:none)]:opacity-100 focus-visible:opacity-100"
                      >
                        Skriv privat
                      </button>
                    )}
                  </div>
                  {item.messages.map((m, j) => (
                    <Bubble key={j} message={m} subject={thread.subject} own={item.own} first={j === 0} />
                  ))}
                </div>
              </div>
            ),
          )}
          {sending && (
            <div className="flex flex-col items-end gap-1 opacity-70">
              <div className="max-w-[min(85%,560px)] rounded-[18px] rounded-br-md bg-accent px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-accent-fg">
                {sending}
              </div>
              <span role="status" className="px-1 text-[12px] text-fg-subtle">
                Sender …
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Reply */}
      <div className="border-t border-border bg-bg px-3 pt-2.5 pb-3 sm:px-6">
        <div className="mx-auto max-w-[760px]">
          {canReply ? (
            <>
              {sendError && <InlineError className="mb-2">{sendError}</InlineError>}
              {thread.reply?.files.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {thread.reply.files.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12.5px] text-fg">
                      <Paperclip className="size-3.5 text-fg-subtle" /> {f.name}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface py-1.5 pr-1.5 pl-3.5 shadow-card transition-colors focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
                <textarea
                  ref={field}
                  rows={1}
                  value={draft}
                  disabled={!!sending}
                  maxLength={thread.reply && thread.reply.body.maxLength > 0 ? thread.reply.body.maxLength : undefined}
                  aria-label="Skriv et svar"
                  placeholder={firstName ? `Besked til ${firstName}` : 'Skriv et svar'}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setSendError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touchScreen()) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  className="max-h-[180px] min-h-[24px] flex-1 resize-none self-center bg-transparent py-1 text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle disabled:opacity-60"
                />
                <Button
                  variant="primary"
                  size="icon-sm"
                  className="size-8 rounded-xl"
                  aria-label="Send"
                  title="Send (Enter)"
                  disabled={!draft.trim() || !!sending}
                  onClick={send}
                >
                  <ArrowUp strokeWidth={2.4} />
                </Button>
              </div>
              <p className="mt-1.5 hidden px-1 text-[11.5px] text-fg-subtle sm:block">Enter sender · Shift+Enter giver ny linje</p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-[13px] text-fg-muted">
              <span>Du kan ikke svare i denne tråd.</span>
              {others[0] && hasPhoto(others[0].id) && (
                <Button size="sm" onClick={() => onWrite(others[0].id)}>
                  <SquarePen /> Skriv til {others[0].name.split(' ')[0]}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
