// An open message thread as a chat: the others on the left with their photos,
// the student's own messages on the right, and a reply field at the bottom
// that writes into Lectio's own (hidden) reply form and presses its Send.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, ChevronDown, ChevronLeft, FileText, Flag, MoreHorizontal, Paperclip, Pencil, Plus, Printer, Reply, Trash2, X } from 'lucide-react';
import { Action, RichText } from './shared.jsx';
import { Avatar, usePhotos } from './avatars.jsx';

const icons = { edit: Pencil, add: Plus, flag: Flag, document_scanner: FileText, print: Printer, delete: Trash2, reply: Reply };

// A small dropdown of Lectio's own menu actions. It opens upwards in the lower
// half of the window, so the last message's menu isn't cut off.
export function Menu({ label, items, className = '' }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const doc = ref.current.ownerDocument;
    const close = event => { if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current.contains(event.target)) setOpen(false); };
    doc.addEventListener('pointerdown', close);
    doc.addEventListener('keydown', close);
    return () => { doc.removeEventListener('pointerdown', close); doc.removeEventListener('keydown', close); };
  }, [open]);
  const toggle = () => {
    if (!open) setUp(ref.current.getBoundingClientRect().top > ref.current.ownerDocument.defaultView.innerHeight / 2);
    setOpen(o => !o);
  };
  return <div ref={ref} className={`lx-menu${open ? ' lx-open' : ''}${up ? ' lx-menu-up' : ''} ${className}`}>
    <button type="button" className="lx-icon-chip" aria-label={label} title={label} aria-expanded={open} onClick={toggle}><MoreHorizontal size={18} aria-hidden="true" /></button>
    {open && <div className="lx-menu-list" onClick={() => setOpen(false)}>
      {items.map((item, i) => {
        const Icon = icons[item.icon];
        const inner = <>{Icon ? <Icon size={16} aria-hidden="true" /> : <span className="lx-menu-icon" />}<span>{item.label}</span></>;
        return item.onClick ? <button key={i} type="button" className="lx-menu-item" onClick={item.onClick}>{inner}</button> : <Action key={i} source={item.source} className="lx-menu-item">{inner}</Action>;
      })}
    </div>}
  </div>;
}

// Files attached to a message being written, each removable through Lectio's own link.
export function FileChips({ files }) {
  if (!files.length) return null;
  return <div className="lx-thread-files">{files.map((f, i) => <span key={i} className="lx-file">
    <Paperclip size={15} aria-hidden="true" />{f.href ? <a href={f.href} target="_blank" rel="noopener">{f.name}</a> : <span>{f.name}</span>}
    {f.remove && <Action source={f.remove} className="lx-file-remove" title={`Fjern ${f.name}`}><X size={14} aria-hidden="true" /></Action>}
  </span>)}</div>;
}

// The panel fills the window below the toolbar; only its middle scrolls.
export function useFillWindow(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    const win = el.ownerDocument.defaultView;
    const fit = () => el.style.setProperty('--lx-thread-top', `${Math.max(0, Math.round(el.getBoundingClientRect().top + win.scrollY))}px`);
    fit();
    win.addEventListener('resize', fit);
    return () => win.removeEventListener('resize', fit);
  }, []);
}

// A text field that grows with its text up to a limit, then scrolls.
export function useAutoGrow(ref, value, max = 160) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value]);
}

// Calls back when something sent to Lectio neither loads a new page nor
// changes this one within the time limit.
export function useStalled(waiting, stalled, ms = 20000) {
  const leaving = useRef(false);
  useEffect(() => {
    if (!waiting) return;
    const win = window;
    const leave = () => { leaving.current = true; };
    win.addEventListener('beforeunload', leave);
    const timer = setTimeout(() => { if (!leaving.current) stalled(); }, ms);
    return () => { clearTimeout(timer); win.removeEventListener('beforeunload', leave); };
  }, [waiting]);
}

// Enter sends, except on touch screens, where it starts a new line.
export const touchScreen = el => !!el?.ownerDocument.defaultView.matchMedia?.('(pointer: coarse)').matches;

const timeFormat = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'long' });
const dayFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
const yearFormat = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
const fullFormat = new Intl.DateTimeFormat('da-DK', { dateStyle: 'full', timeStyle: 'short' });
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// "I dag 14.33", "I går 09.10", "Tirsdag 12.00", "tor. 5. mar. 14.33"
function stampLabel(date, now = new Date()) {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  const time = timeFormat.format(date);
  if (days === 0) return `I dag ${time}`;
  if (days === 1) return `I går ${time}`;
  if (days > 1 && days < 7) { const day = weekdayFormat.format(date); return `${day[0].toLocaleUpperCase('da')}${day.slice(1)} ${time}`; }
  return `${(date.getFullYear() === now.getFullYear() ? dayFormat : yearFormat).format(date)} ${time}`;
}

const HOUR = 3600000;
const senderKey = m => m.sender.id || m.sender.full;

// Messages become runs from one sender; a time label starts the thread and
// every new day or pause of an hour, like iMessage.
function groupMessages(messages) {
  const items = [];
  messages.forEach((message, i) => {
    const previous = messages[i - 1];
    const pause = !previous || (message.date && previous.date && (message.date - previous.date >= HOUR || startOfDay(message.date) !== startOfDay(previous.date)));
    if (pause && (message.date || message.stamp)) items.push({ type: 'stamp', date: message.date, stamp: message.stamp });
    const last = items.at(-1);
    if (last?.type === 'group' && senderKey(last.messages[0]) === senderKey(message)) last.messages.push(message);
    else items.push({ type: 'group', own: message.own, sender: message.sender, messages: [message] });
  });
  return items;
}

// Replies are titled "Re: <subject>"; only a title of its own is worth showing.
const ownTitle = (title, subject) => {
  const t = title.trim().toLocaleLowerCase('da');
  const s = subject.trim().toLocaleLowerCase('da');
  return t && t !== s && t.replace(/^(re|sv|vs|fw|fwd):\s*/, '') !== s.replace(/^(re|sv|vs|fw|fwd):\s*/, '') ? title : '';
};

function Message({ message, subject, tail, own }) {
  // A tap on a bubble shows its time and actions, where there is no hover.
  const [active, setActive] = useState(false);
  const title = ownTitle(message.title, subject);
  const hasText = !!message.content && (!!message.content.textContent.trim() || !!message.content.querySelector('img'));
  const when = message.date ? fullFormat.format(message.date) : message.stamp;
  return <div className="lx-thread-message">
    {(hasText || title) && <div className={`lx-bubble-row${active ? ' lx-active' : ''}`}>
      <div className={`lx-bubble${tail ? ' lx-tail' : ''}`} title={when} onClick={e => { if (!e.target.closest('a') && !e.view.getSelection()?.toString()) setActive(a => !a); }}>
        <div className="lx-bubble-body">
          {title && <strong className="lx-bubble-title">{title}</strong>}
          {hasText && <RichText node={message.content} className="lx-bubble-text" />}
        </div>
      </div>
      {message.actions.length > 0 && <Menu label="Handlinger for beskeden" items={message.actions} className="lx-bubble-menu" />}
    </div>}
    {active && when && <span className="lx-thread-time">{when}</span>}
    {message.attachments.length > 0 && <div className={`lx-bubble-files${own ? ' lx-own' : ''}`}>
      {message.attachments.map(file => <a key={file.href} className="lx-file" href={file.href} target="_blank" rel="noopener"><Paperclip size={15} aria-hidden="true" /><span>{file.name}</span>{file.size && <small>{file.size}</small>}</a>)}
    </div>}
  </div>;
}

export const listNames = names => names.length <= 3 ? names.join(', ').replace(/, ([^,]*)$/, ' og $1') : `${names.slice(0, 2).join(', ')} og ${names.length - 2} andre`;

export function ThreadView({ thread, showOriginal }) {
  const { reply, actions } = thread;
  const shell = useRef(null);
  const log = useRef(null);
  const field = useRef(null);
  const pinned = useRef(true);
  const refocus = useRef(false);
  const [draft, setDraft] = useState(() => reply?.body.value || '');
  const [sending, setSending] = useState(null);
  const [error, setError] = useState('');
  const [peopleOpen, setPeopleOpen] = useState(false);

  // Everyone in the thread once: the recipients, then anyone else who wrote.
  const people = [];
  for (const p of [...thread.recipients, ...thread.messages.map(m => ({ ...m.sender, own: m.own }))]) {
    if (!people.some(q => (q.id || q.full) === (p.id || p.full))) people.push(p);
  }
  const others = people.filter(p => !p.own);
  const group = others.length > 1;
  const ownIds = people.filter(p => p.own && p.id).map(p => p.id);
  const photos = usePhotos(thread.base, people.map(p => p.id), Object.fromEntries(thread.me.photo ? ownIds.map(id => [id, thread.me.photo]) : []));
  const photoOf = p => photos[p.id] ?? (p.own ? thread.me.photo : null);
  const items = groupMessages(thread.messages);

  useFillWindow(shell);
  // Open at the newest message, and follow new ones while the reader is at the bottom.
  useLayoutEffect(() => { const el = log.current; if (pinned.current) el.scrollTop = el.scrollHeight; });
  // Pictures in messages load late and push the newest message down.
  useEffect(() => {
    const el = log.current;
    const follow = () => { if (pinned.current) el.scrollTop = el.scrollHeight; };
    el.addEventListener('load', follow, true);
    return () => el.removeEventListener('load', follow, true);
  }, []);
  // Lectio answered the send: the new message is in the thread and its reply form is empty again.
  const count = thread.messages.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    setSending(null);
    setDraft(reply?.body.value || '');
    pinned.current = true;
    if (refocus.current) { refocus.current = false; requestAnimationFrame(() => field.current?.focus()); }
  }, [count]);
  useStalled(sending, () => { setSending(null); setError('Beskeden blev ikke sendt. Prøv igen, eller brug Lectios visning.'); });
  useAutoGrow(field, draft);

  const touch = () => touchScreen(field.current);
  const write = value => { setDraft(value); setError(''); if (reply) reply.body.value = value; };
  const send = () => {
    if (!reply || sending || !draft.trim()) return;
    reply.body.value = draft;
    if (reply.title && !reply.title.value.trim()) reply.title.value = `Re: ${thread.subject}`;
    pinned.current = true;
    refocus.current = !touch();
    setSending(draft);
    reply.send.click();
  };
  const menu = [...actions.menu.filter(item => item.icon !== 'flag' || !actions.flag), { label: 'Lectios visning', onClick: showOriginal }];

  return <section ref={shell} className="lx-thread" aria-label={`Tråd: ${thread.subject}`}>
    <header className="lx-thread-head">
      <a className="lx-thread-back" href={thread.back}><ChevronLeft size={20} aria-hidden="true" /><span>Beskeder</span></a>
      <div className="lx-thread-who">
        <span className={`lx-thread-faces${others.length > 1 ? ' lx-stacked' : ''}`}>{(others.length ? others : people).slice(0, 3).map(p => <Avatar key={p.id || p.full} person={p} photo={photoOf(p)} size={others.length > 1 ? 30 : 36} />)}</span>
        <div className="lx-thread-heading">
          <h2>{thread.subject}</h2>
          <button type="button" className="lx-thread-people-toggle" aria-expanded={peopleOpen} onClick={() => setPeopleOpen(o => !o)}>
            <span>{others.length ? listNames(others.map(p => p.name)) : thread.recipientsText || 'Kun dig'}</span><ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="lx-thread-actions">
        {actions.flag && <Action source={actions.flag} className={`lx-icon-chip${actions.flagged ? ' lx-flagged' : ''}`} title={actions.flagged ? 'Fjern flag' : 'Flag tråden'}><Flag size={17} aria-hidden="true" /></Action>}
        <Menu label="Flere handlinger" items={menu} />
      </div>
    </header>
    {peopleOpen && <ul className="lx-thread-people" aria-label="Deltagere">
      {people.map(p => <li key={p.id || p.full}><Avatar person={p} photo={photoOf(p)} size={28} /><span>{p.name}{p.own && <small> (dig)</small>}</span>{p.full !== p.name && <small>{p.full.slice(p.name.length).trim()}</small>}</li>)}
    </ul>}
    <div ref={log} className="lx-thread-log" role="log" aria-label="Beskeder i tråden" onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      {items.map((item, i) => item.type === 'stamp'
        ? <p key={i} className="lx-thread-stamp">{item.date ? stampLabel(item.date) : item.stamp}</p>
        : <div key={i} className={`lx-thread-group${item.own ? ' lx-own' : ''}`}>
          {!item.own && <Avatar person={item.sender} photo={photoOf(item.sender)} size={30} />}
          <div className="lx-thread-stack">
            {!item.own && group && <span className="lx-thread-name" title={item.sender.full}>{item.sender.name}</span>}
            {item.messages.map((message, j) => <Message key={j} message={message} subject={thread.subject} own={item.own} tail={j === item.messages.length - 1} />)}
          </div>
        </div>)}
      {sending && <div className="lx-thread-group lx-own lx-pending">
        <div className="lx-thread-stack">
          <div className="lx-thread-message"><div className="lx-bubble-row"><div className="lx-bubble lx-tail"><div className="lx-bubble-body lx-bubble-plain">{sending}</div></div></div></div>
          <span className="lx-thread-status" role="status">Sender …</span>
        </div>
      </div>}
    </div>
    {reply ? <div className="lx-thread-composer">
      {error && <p className="lx-thread-error" role="alert">{error}</p>}
      <FileChips files={reply.files} />
      <div className="lx-thread-compose-row">
        {reply.attach && <Action source={reply.attach} className="lx-icon-chip lx-thread-attach" title="Vedhæft fil"><Paperclip size={18} aria-hidden="true" /></Action>}
        <div className="lx-thread-field">
          <textarea ref={field} rows={1} value={sending ? '' : draft} disabled={!!sending} aria-label="Skriv et svar" maxLength={reply.body.maxLength > 0 ? reply.body.maxLength : undefined} placeholder={others.length === 1 ? `Besked til ${others[0].name.split(' ')[0]}` : 'Skriv en besked'}
            onChange={e => write(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touch()) { e.preventDefault(); send(); } }} />
          <button type="button" className="lx-thread-send" aria-label="Send" title="Send (Enter)" disabled={!!sending || !draft.trim()} onClick={send}><ArrowUp size={18} strokeWidth={2.4} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
    : <div className="lx-thread-composer lx-thread-closed">
      {actions.reply ? <Action source={actions.reply} className="lx-primary-button"><Reply size={16} aria-hidden="true" /> Besvar</Action>
        : <p>Du kan ikke svare i denne tråd.</p>}
      <button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios visning <ArrowUpRight size={16} aria-hidden="true" /></button>
    </div>}
  </section>;
}
