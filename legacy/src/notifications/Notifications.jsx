import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, RefreshCw, X } from 'lucide-react';
import { api } from '../settings.js';
import { INTERVALS, intervalOf, loadCalendar, saveCalendar } from '../calendar/store.js';
import { syncSchedule } from '../calendar/scrape.js';
import { accountState, loadScheduleState, SCHEDULE_STATE } from './store.js';
import { messageTitle, scheduleScope } from './changes.js';

const dateFormat = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const lessonWhen = lesson => {
  const [year, month, day] = lesson.start.slice(0, 10).split('-');
  return `${day}/${month}/${year} · ${lesson.start.slice(11)}–${lesson.end.slice(11)}`;
};
const kinds = { changed: 'Ændret modul', cancelled: 'Aflyst modul', removed: 'Fjernet modul', restored: 'Genoptaget modul', message: 'Ny besked', assignment: 'Ny aflevering' };
const summary = message => message.item ? message.item.description || '' : lessonWhen(message.lesson) + (message.lesson.rooms?.length ? ` · ${message.lesson.rooms.join(', ')}` : '');
function changesIn(message) {
  const { lesson, before } = message;
  if (!before || !lesson) return '';
  const changes = [];
  if (before.start !== lesson.start || before.end !== lesson.end) changes.push(`Tid: ${lessonWhen(before)} → ${lessonWhen(lesson)}`);
  for (const [field, label] of [['rooms', 'Lokale'], ['teachers', 'Lærer'], ['holds', 'Hold']]) {
    if (JSON.stringify(before[field]) !== JSON.stringify(lesson[field])) changes.push(`${label}: ${before[field]?.join(', ') || 'ikke angivet'} → ${lesson[field]?.join(', ') || 'ikke angivet'}`);
  }
  if (before.title !== lesson.title) changes.push(`Titel: ${before.title || 'ikke angivet'} → ${lesson.title || 'ikke angivet'}`);
  if (before.details !== lesson.details) changes.push('Lektier eller noter er opdateret.');
  return changes.join('\n');
}
function itemHref(message, context) {
  try {
    const href = new URL(message.item?.href || message.lesson?.href);
    const schedule = new URL(context.scheduleHref);
    const allowed = /^https:\/\/(www\.)?lectio\.dk\//.test(href.href) || (schedule.hostname === '127.0.0.1' && href.origin === schedule.origin);
    return allowed && href.pathname.startsWith(schedule.pathname.replace(/SkemaNy\.aspx$/i, '')) ? href.href : null;
  } catch { return null; }
}

export function Notifications({ context, onOpen }) {
  const scope = scheduleScope(context);
  const [account, setAccount] = useState({});
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const area = useRef(null);
  const bell = useRef(null);
  const heading = useRef(null);
  const messages = account.messages || [];
  const unread = messages.filter(message => !message.read).length;
  const status = account.status || {};
  useEffect(() => {
    let alive = true;
    let loaded = false;
    let seen = new Set();
    setOpen(false); setToast(null); setAccount({});
    const accept = (state, announce) => {
      if (!alive) return;
      const next = accountState(state, scope);
      const latest = (next.messages || []).filter(message => !seen.has(message.id) && !message.read);
      if (loaded && announce && latest.length) setToast({ message: latest[0], count: latest.length });
      seen = new Set((next.messages || []).map(message => message.id));
      loaded = true;
      setAccount(next);
    };
    const onChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes[SCHEDULE_STATE]) accept(changes[SCHEDULE_STATE].newValue, true);
      if (changes.calendar) setSettings(changes.calendar.newValue || {});
    };
    api?.storage.onChanged.addListener(onChange);
    loadScheduleState().then(state => { if (!loaded) accept(state, false); });
    loadCalendar().then(value => { if (alive) setSettings(value); });
    return () => { alive = false; api?.storage.onChanged.removeListener(onChange); };
  }, [scope]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 12000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const outside = event => { if (!area.current?.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key !== 'Escape') return;
      if (open && area.current?.contains(document.activeElement)) bell.current?.focus();
      setOpen(false); setToast(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (!scope) return null;
  const show = () => { setOpen(true); setToast(null); onOpen?.(); requestAnimationFrame(() => heading.current?.focus()); };
  const read = async ids => {
    try {
      const result = await api.runtime.sendMessage({ type: 'schedule:read', context, ids });
      if (!result?.ok) throw new Error();
      setError('');
    } catch { setError('Beskederne kunne ikke markeres som læst. Prøv igen.'); }
  };
  const check = async () => {
    setPending(true); setError('');
    try {
      const result = await syncSchedule({ ...context, force: true });
      if (result.ok === false || (!result.started && !result.busy)) setError(result.message || 'Lectio kunne ikke tjekkes. Prøv igen.');
    } catch { setError('Lectio kunne ikke tjekkes. Prøv igen.'); }
    finally { setPending(false); }
  };
  const checking = pending || status.state === 'syncing';
  return <div className="lx-notifications-area" ref={area}>
    <button ref={bell} className="lx-icon-button lx-notifications-bell" type="button" aria-label={`Notifikationer${unread ? `, ${unread} ulæste` : ''}`} aria-expanded={open} aria-controls="lx-notifications-panel" onClick={() => open ? setOpen(false) : show()} title="Notifikationer">
      <Bell size={20} aria-hidden="true" />{unread > 0 && <span className="lx-notifications-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <section id="lx-notifications-panel" className="lx-notifications-panel" aria-labelledby="lx-notifications-title">
      <div className="lx-notifications-heading"><h2 ref={heading} tabIndex={-1} id="lx-notifications-title">Notifikationer</h2><button type="button" className="lx-icon-button" aria-label="Luk notifikationer" onClick={() => { setOpen(false); bell.current?.focus(); }}><X size={18} aria-hidden="true" /></button></div>
      <div className="lx-notifications-tools"><span>{unread ? `${unread} ulæste` : messages.length ? 'Alle beskeder er læst' : 'Skema, beskeder og afleveringer'}</span><button type="button" className="lx-text-button" disabled={!unread} onClick={() => read(messages.map(message => message.id))}><CheckCheck size={16} aria-hidden="true" />Markér alle som læst</button></div>
      {messages.length ? <ol className="lx-notifications-list">{messages.map(message => {
        const href = itemHref(message, context);
        const detail = changesIn(message);
        return <li key={message.id} className={`lx-notification ${message.read ? '' : 'lx-notification-unread'}`}>
          <div className="lx-notification-meta"><span className="lx-notification-kind" data-kind={message.kind}>{kinds[message.kind]}</span><time dateTime={new Date(message.createdAt).toISOString()}>{dateFormat.format(message.createdAt)}</time>{!message.read && <span className="lx-notification-dot" aria-label="Ulæst" />}</div>
          {href ? <a className="lx-notification-title" href={href} onClick={() => read([message.id])}>{messageTitle(message)}</a> : <strong className="lx-notification-title">{messageTitle(message)}</strong>}
          <p className="lx-notification-time">{summary(message)}</p>
          {detail && <p className="lx-notification-detail">{detail}</p>}
          {!message.read && <button type="button" className="lx-text-button lx-notification-read" aria-label={`Markér som læst: ${messageTitle(message)}`} onClick={() => read([message.id])}>Markér som læst</button>}
        </li>;
      })}</ol> : <div className="lx-notifications-empty"><Bell size={24} aria-hidden="true" /><strong>Du er opdateret</strong><p>{status.checkedAt ? 'Nye beskeder, afleveringer og skemaændringer vises her.' : 'Vi gemmer først et udgangspunkt. Derefter får du besked om nyt i Lectio.'}</p></div>}
      <div className="lx-notifications-footer">
        <div className="lx-notifications-check"><p role="status">{checking ? 'Tjekker Lectio…' : status.checkedAt ? `Sidst tjekket ${dateFormat.format(status.checkedAt)}` : 'Lectio er ikke tjekket endnu'}</p><button type="button" className="lx-icon-button" aria-label="Tjek Lectio nu" title="Tjek Lectio nu" disabled={checking} onClick={check}><RefreshCw size={17} className={checking ? 'lx-spin' : undefined} aria-hidden="true" /></button></div>
        {(error || status.message) && <p className="lx-notifications-error" role="status">{error || status.message}</p>}
        <label className="lx-notifications-interval">Tjek automatisk<select aria-label="Hvor ofte Lectio tjekkes" value={intervalOf(settings).minutes} onChange={async event => { try { await saveCalendar({ interval: Number(event.target.value) }); setError(''); } catch { setError('Intervallet kunne ikke gemmes. Prøv igen.'); } }}>{INTERVALS.map(choice => <option key={choice.minutes} value={choice.minutes}>{choice.label}</option>)}</select></label>
        <p className="lx-notifications-note">Gemmes lokalt i denne browser. Tjekker mindst 4 ugers skema samt beskeder og afleveringer, mens Lectio er åben. Virker også uden Google Kalender.</p>
      </div>
    </section>}
    {toast && <div className="lx-notification-toast"><div role="status"><strong>{messageTitle(toast.message)}</strong><p>{summary(toast.message)}{toast.count > 1 && ` · ${toast.count - 1} andre notifikationer`}</p></div><div className="lx-notification-toast-actions"><button type="button" className="lx-text-button" onClick={show}>Se notifikationer</button><button type="button" className="lx-icon-button" aria-label="Luk notifikation" onClick={() => setToast(null)}><X size={18} aria-hidden="true" /></button></div></div>}
  </div>;
}
