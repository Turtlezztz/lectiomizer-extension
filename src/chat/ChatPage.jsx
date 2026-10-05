// The Chat page in Lectiomizer's sidebar: a ChatGPT conversation that can
// read the student's Lectio pages, timetable and documents. It covers the
// content area while open; Lectio's page stays loaded underneath. Answers run
// in the background script (jobs.js), so they carry on while the student
// browses Lectio; this page shows them, live or saved, wherever it is opened.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, BookOpenText, CalendarDays, CircleAlert, FileText, History, LoaderCircle, MessagesSquare, RotateCcw, Square, SquarePen, Trash2, X } from 'lucide-react';
import { api } from '../settings.js';
import { ACTIVITY, EFFORTS, USAGE_URL, deleteConversation, loadActivity, loadConversations, modelOf, saveAccount } from './store.js';
import { PendingSignIn, useAccount, connectChatGPT } from './ChatPanel.jsx';
import { shortUrl } from './format.js';
import { Markdown } from './markdown.jsx';

const SUGGESTIONS = [
  'Hvad har jeg i morgen?',
  'Hvilke opgaver skal jeg aflevere de næste to uger?',
  'Hvordan ser mit fravær ud?',
  'Opsummér opgavebeskrivelsen til min næste aflevering',
];
const MODELS_TTL = 6 * 60 * 60 * 1000;
const OPEN_KEY = 'lectiomizer-chat-open';

const remember = id => { try { id ? sessionStorage.setItem(OPEN_KEY, id) : sessionStorage.removeItem(OPEN_KEY); } catch {} };
const remembered = () => { try { return sessionStorage.getItem(OPEN_KEY); } catch { return null; } };
const listDate = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' });
const listTime = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
const when = time => new Date(time).toDateString() === new Date().toDateString() ? listTime.format(time).replace('.', ':') : listDate.format(time);
const titleOf = text => { const line = text.replace(/\s+/g, ' ').trim(); return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line; };
const toolIcon = part => /skema/i.test(part.label) || part.name === 'get_schedule' ? CalendarDays : /^Hentede|dokument/i.test(part.label) || part.name === 'read_document' ? FileText : BookOpenText;

function ToolLine({ part }) {
  const Icon = toolIcon(part);
  const running = part.status === 'running';
  const label = part.href && !running ? <a href={part.href}>{part.label}</a> : <span>{part.label}</span>;
  return <p className={`lx-chat-tool${part.status === 'error' ? ' lx-chat-tool-error' : ''}`}>
    {running ? <LoaderCircle size={14} className="lx-spin" aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}{label}
  </p>;
}

function AssistantTurn({ turn, base, status, onRetry }) {
  const parts = turn.parts || [];
  return <div className="lx-chat-turn lx-chat-assistant">
    {parts.map((part, i) => part.type === 'tool' ? <ToolLine key={i} part={part} />
      : part.type === 'notice' ? <p key={i} className="lx-chat-notice">{part.text}</p>
      : part.text ? <Markdown key={i} text={part.text} base={base} className={part.phase === 'commentary' ? 'lx-chat-commentary' : ''} /> : null)}
    {status && <p className="lx-chat-status"><LoaderCircle size={14} className="lx-spin" aria-hidden="true" />{status}</p>}
    {turn.stopped && <p className="lx-chat-notice">Stoppet.</p>}
    {turn.error && <div className="lx-chat-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{turn.error}{turn.errorInfo && <small className="lx-chat-error-info">{turn.errorInfo}</small>}</span>{turn.limit && <a className="lx-chip-button" href={USAGE_URL} target="_blank" rel="noopener noreferrer">Administrer forbrug <ArrowUpRight size={14} aria-hidden="true" /></a>}{onRetry && <button type="button" className="lx-chip-button" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" /> Prøv igen</button>}</div>}
  </div>;
}

function SignIn({ account }) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async (consent = false) => {
    setBusy(true);
    setNotice('');
    try {
      const result = await connectChatGPT({ extensionPage: false, consent });
      if (!result?.ok) setNotice(result?.message || 'Kunne ikke starte login. Prøv igen.');
      else if (!result.started) setNotice('Giv Lectiomizer lov til at sende Lectio-indhold til ChatGPT i vinduet, der åbnede, og fortsæt derfra.');
    } catch {
      setNotice('Lectiomizer svarede ikke. Genindlæs siden og prøv igen.');
    } finally {
      setBusy(false);
    }
  };
  const planOnly = account.connected && !account.planEnabled;
  return <div className="lx-chat-signin">
    <MessagesSquare size={28} className="lx-chat-signin-icon" aria-hidden="true" />
    <h2>{planOnly ? 'Giv adgang til din ChatGPT-plan' : 'Chat med din Lectio'}</h2>
    {planOnly
      ? <p>Du er logget ind som {account.email || 'din ChatGPT-konto'}, men Lectiomizer har ikke lov til at bruge din ChatGPT-plan. Uden den kan chatten ikke svare.</p>
      : <p>Spørg om dit skema, dine opgaver, karakterer og fravær. Assistenten læser dine Lectio-sider og dokumenter fra opgaver og lektioner, når du spørger, og svarer med din ChatGPT-plan.</p>}
    {account.pending
      ? <><button type="button" className="lx-chatgpt-button lx-chat-signin-button" disabled>Venter på ChatGPT…</button><PendingSignIn className="lx-chat-small" /></>
      : <button type="button" className="lx-chatgpt-button lx-chat-signin-button" onClick={() => start(planOnly)} disabled={busy}>{planOnly ? 'Tillad brug af din ChatGPT-plan' : 'Fortsæt med ChatGPT'}</button>}
    {(notice || account.message) && <p className="lx-chat-signin-notice" role="alert">{notice || account.message}</p>}
    <p className="lx-chat-small">Lectio-indhold sendes kun til OpenAI, når du stiller et spørgsmål. Samtaler gemmes kun i din Firefox, uden indholdet af de sider og dokumenter, der blev læst.</p>
  </div>;
}

// Running answers from the background script, by conversation id. The port
// is reopened when it drops while an answer runs (e.g. Lectiomizer reloaded).
function useJobs(viewing) {
  const [jobs, setJobs] = useState(() => new Map());
  const port = useRef(null);
  const connect = useRef(null);
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  useEffect(() => {
    let closed = false;
    let running = false;
    connect.current = () => {
      if (closed || port.current || !api?.runtime?.connect) return;
      const p = api.runtime.connect({ name: 'chat' });
      port.current = p;
      setJobs(new Map());
      p.onMessage.addListener(message => {
        if (message?.type !== 'job') return;
        setJobs(prev => {
          const next = new Map(prev).set(message.id, message);
          running = Array.from(next.values()).some(job => job.running);
          return next;
        });
      });
      p.onDisconnect.addListener(() => {
        port.current = null;
        if (!closed && running) setTimeout(() => connect.current(), 500);
      });
      p.postMessage({ type: 'viewing', id: viewingRef.current });
    };
    connect.current();
    return () => { closed = true; try { port.current?.disconnect(); } catch {} port.current = null; };
  }, []);
  useEffect(() => { try { port.current?.postMessage({ type: 'viewing', id: viewing }); } catch {} }, [viewing]);
  // Before asking: the background may have slept and closed the port.
  const ensure = () => connect.current?.();
  return [jobs, ensure];
}

export function ChatPage({ model }) {
  const account = useAccount();
  const [conversations, setConversations] = useState([]);
  const [currentId, setCurrentId] = useState(() => remembered());
  const [activity, setActivity] = useState({ running: [], unread: [] });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const scroller = useRef(null);
  const pinned = useRef(true);
  const textarea = useRef(null);
  const historyRef = useRef(null);
  const root = useMemo(() => new URL(model.base || '/', location.origin).href, [model.base]);
  const [jobs, ensurePort] = useJobs(currentId);
  function open(id) {
    autoOpened.current = true;
    setCurrentId(id);
    remember(id);
    setHistoryOpen(false);
    setNotice('');
    pinned.current = true;
  }

  useEffect(() => {
    loadConversations().then(setConversations);
    loadActivity().then(setActivity);
    const onChange = (changes, area) => {
      if (area !== 'local') return;
      if (changes.chatConversations) setConversations(changes.chatConversations.newValue || []);
      if (changes[ACTIVITY]) setActivity({ running: [], unread: [], ...changes[ACTIVITY].newValue });
    };
    api?.storage.onChanged.addListener(onChange);
    return () => api?.storage.onChanged.removeListener(onChange);
  }, []);
  // Opened without a conversation remembered in this tab (e.g. a new tab):
  // show an answer that is running, or one that finished unread.
  const autoOpened = useRef(!!currentId);
  useEffect(() => {
    if (autoOpened.current || !conversations.length) return;
    const id = [...activity.running, ...activity.unread].find(id => conversations.some(c => c.id === id));
    if (id) { autoOpened.current = true; open(id); }
  }, [activity, conversations]);
  const current = conversations.find(c => c.id === currentId) || null;
  const job = currentId ? jobs.get(currentId) : null;
  const busy = !!job?.running || sending;
  // Until the saved answer arrives, keep showing the one that just finished.
  const live = job && (job.running || current?.turns.at(-1)?.role === 'user') ? job : null;
  const ready = account?.connected && account.planEnabled;
  const fetchModels = () => api.runtime.sendMessage({ type: 'chat:models' })
    .then(result => setModelsError(result?.ok ? '' : result?.message || 'Modellerne kunne ikke hentes.'))
    .catch(() => setModelsError('Lectiomizer svarede ikke. Genindlæs siden.'));
  useEffect(() => {
    if (ready && (!account.models.length || Date.now() - account.modelsAt > MODELS_TTL)) fetchModels();
  }, [ready]);
  useEffect(() => { if (ready) textarea.current?.focus(); }, [ready, currentId]);
  // The phone drawer takes focus and closes on Escape.
  useEffect(() => {
    if (!historyOpen) return;
    historyRef.current?.querySelector('button:not(:disabled)')?.focus();
    const close = e => { if (e.key === 'Escape') { setHistoryOpen(false); textarea.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [historyOpen]);
  // Follow the answer while the student is at the bottom of the log.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [live, current]);
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  if (!account) return <section className="lx-chat" aria-label="Chat" />;
  if (!ready) return <section className="lx-chat lx-chat-empty-page" aria-label="Chat"><SignIn account={account} /></section>;

  const chosen = modelOf(account);
  const pages = model.nav.filter(n => !['Log ud', 'Log ind'].includes(n.label)).map(n => ({ label: n.label, url: shortUrl(n.href, root) })).filter(p => p.url);
  const scheduleHref = model.nav.find(n => n.label === 'Skema')?.href || new URL('SkemaNy.aspx', root).href;
  // What the background needs to answer for this student and school.
  const context = () => ({
    root, scheduleHref, pages, school: model.school,
    name: model.name !== 'Min profil' ? model.name : '',
    term: document.querySelector('[id$="ChooseTerm_term"]')?.selectedOptions?.[0]?.textContent?.trim() || '',
  });
  const settings = () => ({ model: chosen?.slug || '', effort: account.effort });

  const ask = async message => {
    setSending(true);
    setNotice('');
    ensurePort();
    try {
      const result = await api.runtime.sendMessage(message);
      if (!result?.ok) setNotice(result?.message || 'Spørgsmålet kunne ikke sendes.');
      return !!result?.ok;
    } catch {
      setNotice('Lectiomizer svarede ikke. Genindlæs siden, og prøv igen.');
      return false;
    } finally {
      setSending(false);
    }
  };

  const send = async text => {
    const question = text.trim();
    if (!question || busy || !chosen) return;
    const id = current ? current.id : crypto.randomUUID();
    open(id);
    setDraft('');
    if (!await ask({ type: 'chat:send', id, title: titleOf(question), question, context: context(), settings: settings() })) setDraft(question);
  };

  // Answers the last question again, replacing an answer that failed.
  const retry = () => { if (current && !busy) ask({ type: 'chat:retry', id: current.id, context: context(), settings: settings() }); };
  const stop = () => api.runtime.sendMessage({ type: 'chat:stop', id: currentId }).catch(() => {});

  const remove = async conversation => {
    if (!window.confirm(`Slet samtalen "${conversation.title}"?`)) return;
    api.runtime.sendMessage({ type: 'chat:stop', id: conversation.id }).catch(() => {});
    await deleteConversation(conversation.id);
    if (currentId === conversation.id) open(null);
  };

  const turns = current?.turns || [];
  // A question without an answer and nothing running: the answer was lost (e.g. Firefox closed).
  const unanswered = !live && !busy && turns.at(-1)?.role === 'user';
  const history = <aside ref={historyRef} className={`lx-chat-history${historyOpen ? ' lx-open' : ''}`} aria-label="Samtaler">
    <div className="lx-chat-history-head">
      <button type="button" className="lx-chip-button lx-chat-new" onClick={() => open(null)}><SquarePen size={16} aria-hidden="true" /> Ny samtale</button>
      <button type="button" className="lx-icon-chip lx-chat-history-close" aria-label="Luk samtaler" onClick={() => setHistoryOpen(false)}><X size={18} aria-hidden="true" /></button>
    </div>
    <p className="lx-chat-history-label">Samtaler</p>
    {conversations.length ? <ul className="lx-chat-list">{conversations.map(c => <li key={c.id} className={c.id === currentId ? 'lx-current' : undefined}>
      <button type="button" className="lx-chat-list-open" onClick={() => open(c.id)} aria-current={c.id === currentId ? 'true' : undefined}>
        <span>{c.title}</span>
        <small>{activity.running.includes(c.id) ? <><LoaderCircle size={11} className="lx-spin" aria-hidden="true" /> Svarer…</> : activity.unread.includes(c.id) && c.id !== currentId ? <><i className="lx-chat-dot" aria-hidden="true" /> Nyt svar</> : when(c.updated || c.created)}</small>
      </button>
      <button type="button" className="lx-chat-list-delete" aria-label={`Slet ${c.title}`} title="Slet samtalen" onClick={() => remove(c)}><Trash2 size={15} aria-hidden="true" /></button>
    </li>)}</ul> : <p className="lx-chat-history-empty">Dine samtaler gemmes her.</p>}
    <div className="lx-chat-account">
      <span title={account.email}>{account.email || 'ChatGPT'}</span>
      <button type="button" className="lx-text-button" onClick={() => api.runtime.sendMessage({ type: 'chat:disconnect' })} disabled={activity.running.length > 0}>Log ud</button>
    </div>
  </aside>;

  return <section className="lx-chat" aria-label="Chat">
    {history}
    {historyOpen && <button type="button" className="lx-chat-scrim" tabIndex={-1} aria-label="Luk samtaler" onClick={() => setHistoryOpen(false)} />}
    <div className="lx-chat-main">
      <div className="lx-chat-bar">
        <button type="button" className="lx-icon-chip lx-chat-history-toggle" aria-label="Vis samtaler" aria-expanded={historyOpen} onClick={() => setHistoryOpen(true)}><History size={18} aria-hidden="true" /></button>
        <h2 className="lx-chat-title">{current?.title || 'Ny samtale'}</h2>
        {current && <button type="button" className="lx-chip-button" onClick={() => open(null)}><SquarePen size={16} aria-hidden="true" /> Ny</button>}
      </div>
      <div ref={scroller} className="lx-chat-log" role="log" aria-live="polite" aria-busy={busy} onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {!account.welcomed && <div className="lx-chat-welcome">
          <div><strong>Du bruger din ChatGPT-plan</strong><p>Svar i chatten trækker på forbruget i din ChatGPT-plan. Du kan se og begrænse det i ChatGPT.</p></div>
          <div className="lx-button-row"><a className="lx-chip-button" href={USAGE_URL} target="_blank" rel="noopener noreferrer">Administrer forbrug <ArrowUpRight size={14} aria-hidden="true" /></a><button type="button" className="lx-primary-button" onClick={() => saveAccount({ welcomed: true })}>Forstået</button></div>
        </div>}
        {!turns.length && <div className="lx-chat-start">
          <h2>Hvad vil du vide?</h2>
          <p>Assistenten læser dit skema, dine opgaver, karakterer, fravær, beskedlister og dokumenter fra opgaver og lektioner, når det er nødvendigt for at svare.</p>
          <div className="lx-chat-suggestions">{SUGGESTIONS.map(s => <button key={s} type="button" className="lx-chip-button" onClick={() => send(s)} disabled={busy || !chosen}>{s}</button>)}</div>
        </div>}
        {turns.map((turn, i) => turn.role === 'user'
          ? <div key={i} className="lx-chat-turn lx-chat-user"><p>{turn.text}</p></div>
          : <AssistantTurn key={i} turn={turn} base={root} onRetry={(turn.retry && turn.error || turn.stopped) && i === turns.length - 1 && !busy ? retry : null} />)}
        {live && <AssistantTurn turn={{ parts: live.parts }} base={root} status={live.running ? live.status || (live.parts.length ? '' : 'Tænker…') : ''} />}
        {unanswered && <div className="lx-chat-turn lx-chat-assistant"><div className="lx-chat-error"><CircleAlert size={16} aria-hidden="true" /><span>Svaret blev ikke færdigt.</span><button type="button" className="lx-chip-button" onClick={retry}><RotateCcw size={14} aria-hidden="true" /> Prøv igen</button></div></div>}
        {notice && <p className="lx-chat-notice" role="alert">{notice}</p>}
      </div>
      <form className="lx-chat-composer" onSubmit={e => { e.preventDefault(); send(draft); }}>
        {!chosen && modelsError && <div className="lx-chat-error" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>Kunne ikke hente dine modeller fra ChatGPT: {modelsError}</span><button type="button" className="lx-chip-button" onClick={fetchModels}>Prøv igen</button></div>}
        <div className="lx-chat-field">
          <textarea ref={textarea} rows={1} value={draft} aria-label="Skriv en besked" placeholder={chosen ? 'Spørg om dit skema, opgaver, karakterer …' : 'Henter modeller fra ChatGPT …'} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }} />
          {busy
            ? <button type="button" className="lx-chat-send lx-chat-stop" aria-label="Stop svaret" title="Stop" onClick={stop} disabled={!job?.running}><Square size={14} fill="currentColor" aria-hidden="true" /></button>
            : <button type="submit" className="lx-chat-send" aria-label="Send" title="Send" disabled={!draft.trim() || !chosen}><ArrowUp size={18} aria-hidden="true" /></button>}
        </div>
        <div className="lx-chat-options">
          <label><span>Model</span><select value={chosen?.slug || ''} onChange={e => saveAccount({ model: e.target.value })} disabled={busy || !account.models.length}>{account.models.length ? account.models.map(m => <option key={m.slug} value={m.slug}>{m.name}</option>) : <option value="">Ingen modeller endnu</option>}</select></label>
          <label><span>Tænkning</span><select value={account.effort} onChange={e => saveAccount({ effort: e.target.value })} disabled={busy}>{EFFORTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <span className="lx-chat-plan">Bruger din ChatGPT-plan · <a href={USAGE_URL} target="_blank" rel="noopener noreferrer">Administrer forbrug</a></span>
        </div>
      </form>
    </div>
  </section>;
}
