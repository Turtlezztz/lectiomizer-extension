// Assistent: a ChatGPT conversation that reads the student's Lectio through
// the tools in lib/agent. Answers run in jobs.ts, so they keep going while the
// student uses the rest of the app.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowUp, ArrowUpRight, BookOpenText, CalendarDays, CircleAlert, ClipboardList, FileText, GraduationCap, History, LoaderCircle, Mail, MessagesSquare, RotateCcw, Sparkles, Square, SquarePen, Trash2, UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { schoolRoot, PATHS } from '@/lib/lectio/paths';
import { useLectioPage } from '@/lib/lectio/query';
import { readMe } from '@/lib/lectio/readers/thread.js';
import { send } from '@/lib/sync/hooks';
import {
  EFFORTS, USAGE_URL, deleteConversation, modelOf, saveAccount, type AssistantTurn, type ChatAccount, type Conversation, type Part,
} from '@/lib/agent/account';
import { Markdown } from './Markdown';
import { connectChatGPT, useChatAccount, useConversations } from './hooks';
import { ask, forget, retryAnswer, stop, useJobs, type Context } from './jobs';

const SUGGESTIONS = [
  'Hvad har jeg i morgen?',
  'Hvilke opgaver skal jeg aflevere de næste to uger?',
  'Hvordan ser mit fravær ud?',
  'Opsummér opgavebeskrivelsen til min næste aflevering',
];
const MODELS_TTL = 6 * 60 * 60 * 1000;

const listDate = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' });
const listTime = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
const whenLabel = (time: number) => (new Date(time).toDateString() === new Date().toDateString() ? listTime.format(time).replace('.', ':') : listDate.format(time));

const TOOL_ICONS: Record<string, typeof FileText> = {
  get_schedule: CalendarDays, get_lesson: CalendarDays, list_assignments: ClipboardList, get_assignment: ClipboardList,
  list_messages: Mail, read_message: Mail, get_grades: GraduationCap, get_absence: UserX, read_document: FileText,
};

// ------------------------------------------------------------------ sign-in

function PendingSignIn() {
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  return (
    <div className="mt-4 w-full max-w-md space-y-2 text-left">
      <p className="text-[12.5px] text-fg-muted">
        Log ind i fanen, der åbnede. Hvis den ender på en side, der ikke kan vises (127.0.0.1), så kopiér adressen herind:
      </p>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await send({ type: 'chat:callback', url: value });
          setMessage(result?.ok ? '' : result?.message || 'Det virkede ikke.');
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="http://127.0.0.1:…/auth/callback?code=…" className="font-mono text-[12px]" aria-label="Login-adresse" />
        <Button type="submit" disabled={!value.trim()}>Fortsæt</Button>
      </form>
      <div className="flex items-center justify-between">
        {message ? <p className="text-[12.5px] text-danger" role="alert">{message}</p> : <span />}
        <Button size="sm" variant="ghost" onClick={() => send({ type: 'chat:cancel' })}>Annullér</Button>
      </div>
    </div>
  );
}

function SignIn({ account }: { account: ChatAccount }) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const planOnly = account.connected && !account.planEnabled;
  const start = async () => {
    setBusy(true);
    setNotice(await connectChatGPT(planOnly));
    setBusy(false);
  };
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-fg">
        <MessagesSquare className="size-6" />
      </div>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{planOnly ? 'Giv adgang til din ChatGPT-plan' : 'Spørg om din Lectio'}</h2>
      <p className="mt-2 text-[14px] text-fg-muted">
        {planOnly
          ? `Du er logget ind som ${account.email || 'din ChatGPT-konto'}, men Lectiomizer har ikke lov til at bruge din ChatGPT-plan. Uden den kan assistenten ikke svare.`
          : 'Assistenten kan læse dit skema, dine opgaver og opgavebeskrivelser, lektioner, beskeder, karakterer og fravær, når du spørger, og svarer med din egen ChatGPT-plan.'}
      </p>
      {account.pending ? (
        <>
          <Button className="mt-6" size="lg" disabled>
            <LoaderCircle className="animate-spin" /> Venter på ChatGPT…
          </Button>
          <PendingSignIn />
        </>
      ) : (
        <Button className="mt-6" size="lg" variant="primary" onClick={start} disabled={busy}>
          {planOnly ? 'Tillad brug af din ChatGPT-plan' : 'Fortsæt med ChatGPT'}
        </Button>
      )}
      {(notice || account.message) && <p className="mt-3 text-[13px] text-danger" role="alert">{notice || account.message}</p>}
      <p className="mt-6 text-[12px] text-fg-subtle">
        Lectio-indhold sendes kun til OpenAI, når du stiller et spørgsmål. Assistenten kan kun læse – den kan ikke aflevere, sende eller ændre noget. Samtaler gemmes kun i din browser, uden indholdet af de sider og dokumenter, der blev læst.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ turns

function ToolLine({ part }: { part: Extract<Part, { type: 'tool' }> }) {
  const Icon = TOOL_ICONS[part.name] || BookOpenText;
  const running = part.status === 'running';
  const label = part.href && !running ? <a href={part.href} target="_blank" rel="noreferrer" className="hover:underline">{part.label}</a> : <span>{part.label}</span>;
  return (
    <p className={cn('flex items-center gap-2 text-[12.5px]', part.status === 'error' ? 'text-danger' : 'text-fg-subtle')}>
      {running ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <Icon className="size-3.5 shrink-0" />}
      <span className="min-w-0 truncate">{label}</span>
    </p>
  );
}

function Assistant({ turn, base, status, onRetry }: { turn: AssistantTurn; base: string; status?: string; onRetry?: () => void }) {
  const tools = turn.parts.filter((p) => p.type === 'tool');
  return (
    <div className="space-y-2">
      {tools.length > 0 && (
        <div className="space-y-1 rounded-lg border border-border bg-surface-2/50 px-3 py-2">
          {turn.parts.map((p, i) => (p.type === 'tool' ? <ToolLine key={i} part={p} /> : null))}
        </div>
      )}
      {turn.parts.map((p, i) =>
        p.type === 'notice' ? (
          <p key={i} className="text-[13px] text-fg-subtle italic">{p.text}</p>
        ) : p.type === 'text' && p.text ? (
          <Markdown key={i} text={p.text} base={base} className={p.phase === 'commentary' ? 'text-fg-muted' : ''} />
        ) : null,
      )}
      {status && (
        <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
          <LoaderCircle className="size-3.5 animate-spin" /> {status}
        </p>
      )}
      {turn.stopped && <p className="text-[13px] text-fg-subtle italic">Stoppet.</p>}
      {turn.error && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13.5px]" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            {turn.error}
            {turn.errorInfo && <div className="mt-0.5 font-mono text-[11.5px] text-fg-subtle">{turn.errorInfo}</div>}
          </div>
          {turn.limit && (
            <Button size="sm" asChild>
              <a href={USAGE_URL} target="_blank" rel="noreferrer">Forbrug <ArrowUpRight /></a>
            </Button>
          )}
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              <RotateCcw /> Prøv igen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page

function Composer({ onSend, onStop, running, disabled }: { onSend: (text: string) => Promise<boolean>; onStop: () => void; running: boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(220, el.scrollHeight) + 'px';
  }, [draft]);
  const submit = async () => {
    const text = draft.trim();
    if (!text || running) return;
    if (await onSend(text)) setDraft('');
  };
  return (
    <form
      className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-card focus-within:border-border-strong"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={ref}
        rows={1}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Spørg om skema, opgaver, beskeder, karakterer …"
        aria-label="Dit spørgsmål"
        className="max-h-[220px] min-h-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
      />
      {running ? (
        <Button type="button" size="icon" variant="secondary" onClick={onStop} aria-label="Stop svaret" title="Stop">
          <Square className="fill-current" />
        </Button>
      ) : (
        <Button type="submit" size="icon" variant="primary" disabled={!draft.trim() || disabled} aria-label="Send" title="Send (Enter)">
          <ArrowUp />
        </Button>
      )}
    </form>
  );
}

function ConversationList({ conversations, current, running, onOpen, onDelete }: { conversations: Conversation[]; current: string | null; running: Set<string>; onOpen: (id: string | null) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button className="w-full justify-start" onClick={() => onOpen(null)}>
          <SquarePen /> Ny samtale
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {!conversations.length && <p className="px-2 py-4 text-[12.5px] text-fg-subtle">Ingen samtaler endnu.</p>}
        {conversations.map((c) => (
          <div key={c.id} className={cn('group flex items-center rounded-lg', c.id === current ? 'bg-surface shadow-card ring-1 ring-border' : 'hover:bg-surface-3/60')}>
            <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
              <div className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                {running.has(c.id) && <LoaderCircle className="size-3 shrink-0 animate-spin text-accent" />}
                <span className="truncate">{c.title}</span>
              </div>
              <div className="text-[11.5px] text-fg-subtle">{whenLabel(c.updated)}</div>
            </button>
            <Button size="icon-sm" variant="ghost" className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Slet ${c.title}`} onClick={() => onDelete(c.id)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelPicker({ account }: { account: ChatAccount }) {
  const model = modelOf(account);
  return (
    <div className="flex items-center gap-2">
      <Select value={model?.slug || ''} onChange={(e) => saveAccount({ model: e.target.value })} aria-label="Model" className="h-8 text-[12.5px]">
        {account.models.map((m) => (
          <option key={m.slug} value={m.slug}>{m.name}</option>
        ))}
      </Select>
      <Select value={account.effort} onChange={(e) => saveAccount({ effort: e.target.value as ChatAccount['effort'] })} aria-label="Tænketid" className="h-8 text-[12.5px]">
        {EFFORTS.map((e) => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </Select>
    </div>
  );
}

function Empty({ onPick, children }: { onPick: (q: string) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
        <Sparkles className="size-5" />
      </div>
      <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Hvad vil du vide?</h2>
      <p className="mt-1 max-w-md text-[13.5px] text-fg-muted">Assistenten slår op i din Lectio, når den skal bruge noget – skema, opgaver, lektioner, beskeder, karakterer og fravær.</p>
      <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)} className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left text-[13px] shadow-card transition-colors hover:border-border-strong hover:bg-surface-2">
            {s}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

export default function ChatPage() {
  const { settings } = useSettings();
  const school = settings.school!;
  const account = useChatAccount();
  const conversations = useConversations();
  const jobs = useJobs();
  const params = useParams();
  const navigate = useNavigate();
  const [newId, setNewId] = useState(() => crypto.randomUUID());
  const currentId = params.id || null;
  const id = currentId || newId;
  const conversation = conversations.find((c) => c.id === id) || null;
  const job = jobs.get(id);
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const base = schoolRoot(school.id);
  const me = useLectioPage(PATHS.home, readMe as (doc: Document) => { name: string }, { staleTime: 10 * 60_000 });
  const model = modelOf(account);
  const ready = account.connected && account.planEnabled;

  // Plans change; keep the model list fresh.
  useEffect(() => {
    if (ready && (!account.models.length || Date.now() - account.modelsAt > MODELS_TTL)) send({ type: 'chat:models' }).catch(() => {});
  }, [ready, account.models.length, account.modelsAt]);

  const context = (): Context => ({ schoolId: school.id, school: school.name, name: me.data?.data.name || '', model: model?.slug || '', effort: account.effort });

  const onSend = async (question: string) => {
    setNotice('');
    pinned.current = true;
    const error = await ask(id, question, context());
    if (error) {
      setNotice(error);
      return false;
    }
    if (!currentId) navigate(`/chat/${id}`, { replace: true });
    return true;
  };
  const onRetry = async () => {
    const error = await retryAnswer(id, context());
    if (error) setNotice(error);
  };
  const open = (target: string | null) => {
    setHistoryOpen(false);
    setNotice('');
    pinned.current = true;
    if (target) navigate(`/chat/${target}`);
    else {
      setNewId(crypto.randomUUID());
      navigate('/chat');
    }
  };
  const remove = async (target: string) => {
    forget(target);
    await deleteConversation(target);
    if (target === id) open(null);
  };

  const turns = conversation?.turns || [];
  const lastIndex = turns.length - 1;
  // Keep the newest text in view while it streams, unless the student scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  const running = useMemo(() => new Set(jobs.keys()), [jobs, job?.parts, job?.status]);

  if (!ready) return <SignIn account={account} />;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 md:h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface-2/40 lg:block">
        <ConversationList conversations={conversations} current={currentId} running={running} onOpen={open} onDelete={remove} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5 sm:px-6">
          <Button size="icon-sm" variant="ghost" className="lg:hidden" aria-label="Samtaler" onClick={() => setHistoryOpen((v) => !v)}>
            <History />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{conversation?.title || 'Assistent'}</h1>
          <ModelPicker account={account} />
          <Button size="icon-sm" variant="ghost" aria-label="Ny samtale" title="Ny samtale" onClick={() => open(null)}>
            <SquarePen />
          </Button>
        </header>
        {historyOpen && (
          <div className="max-h-[50vh] border-b border-border bg-surface-2/40 lg:hidden">
            <ConversationList conversations={conversations} current={currentId} running={running} onOpen={open} onDelete={remove} />
          </div>
        )}
        <div
          ref={scroller}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          {!turns.length && !job ? (
            <Empty onPick={onSend} />
          ) : (
            <div className="mx-auto w-full max-w-[760px] space-y-6 px-4 py-6 sm:px-6">
              {turns.map((turn, i) =>
                turn.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-[14.5px] whitespace-pre-wrap text-accent-soft-fg">{turn.text}</div>
                  </div>
                ) : (
                  <Assistant key={i} turn={turn} base={base} onRetry={i === lastIndex && !job && (turn.retry || turn.stopped) ? onRetry : undefined} />
                ),
              )}
              {job && <Assistant turn={{ role: 'assistant', parts: job.parts }} base={base} status={job.status} />}
            </div>
          )}
        </div>
        <div className="mx-auto w-full max-w-[760px] px-4 pb-4 sm:px-6">
          {notice && <p className="mb-2 text-[13px] text-danger" role="alert">{notice}</p>}
          <Composer onSend={onSend} onStop={() => stop(id)} running={!!job} disabled={!model} />
          <p className="mt-1.5 text-center text-[11.5px] text-fg-subtle">Svarene kommer fra ChatGPT og kan tage fejl. Tjek vigtige frister i Lectio.</p>
        </div>
      </div>
    </div>
  );
}
