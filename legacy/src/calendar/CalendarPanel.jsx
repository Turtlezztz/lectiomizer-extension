import React, { useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { api } from '../settings.js';
import { CALENDAR_DEFAULTS, GOOGLE_CLIENT_ID, INTERVALS, WEEK_CHOICES, intervalOf, loadCalendar, loadCalendarStatus, nextSyncAt, saveCalendar } from './store.js';

const clock = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
function when(time) {
  const date = new Date(time);
  const today = new Date().toDateString() === date.toDateString();
  return `${today ? '' : `${date.getDate()}/${date.getMonth() + 1} `}kl. ${clock.format(date)}`;
}

// What happened last, and when the next automatic fetch comes.
function syncLines(settings, status) {
  if (status.state === 'syncing') return ['Synkroniserer…', 'Henter skemaet fra Lectio'];
  const next = nextSyncAt(settings, status);
  const upcoming = next > Date.now() ? when(next) : 'når Lectio er åben';
  if (status.state === 'error') return [status.message, status.reconnect ? '' : `Prøver igen ${upcoming}`];
  if (!status.syncedAt) return ['Ikke synkroniseret endnu', 'Sker, når Lectio er åben'];
  const lessons = `${status.lessons} ${status.lessons === 1 ? 'lektion' : 'lektioner'}`;
  return [`Synkroniseret ${when(status.syncedAt)}`, `${lessons} · næste ${upcoming}`];
}

function Group({ id, title, children }) {
  return <div className="lx-group" role="group" aria-labelledby={id}>
    <p className="lx-group-label" id={id}>{title}</p>
    <div className="lx-group-box">{children}</div>
  </div>;
}

// `embedded` is the copy in a Lectio page's settings card. Firefox shows the
// data consent prompt only on extension pages, so there connecting opens the
// extension's own settings window instead.
export function CalendarPanel({ embedded = false }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState({});
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    Promise.all([loadCalendar(), loadCalendarStatus()]).then(([s, st]) => { setSettings(s); setStatus(st); });
    const onChange = (changes, area) => {
      if (area !== 'local') return;
      if (changes.calendar) setSettings({ ...CALENDAR_DEFAULTS, ...changes.calendar.newValue });
      if (changes.calendarStatus) setStatus(changes.calendarStatus.newValue || {});
    };
    api?.storage.onChanged.addListener(onChange);
    return () => api?.storage.onChanged.removeListener(onChange);
  }, []);
  if (!settings) return null;

  const call = async (type, fallback = '') => {
    setPending(type);
    setNotice('');
    try {
      const result = await api.runtime.sendMessage({ type: `calendar:${type}` });
      if (!result?.ok) setNotice(fallback || result?.message || '');
    } catch {
      setNotice('Noget gik galt. Prøv igen.');
    } finally {
      setPending('');
    }
  };
  const connect = () => {
    if (embedded) return call('open-settings');
    // Firefox only shows the data consent prompt from inside the click.
    let consent;
    try { consent = api.permissions.request({ data_collection: ['websiteContent'] }); }
    catch { consent = Promise.resolve(true); }
    consent.catch(() => true).then(granted => granted ? call('connect') : setNotice('Uden din tilladelse sendes skemaet ikke til Google.'));
  };
  const save = patch => {
    setSettings(s => ({ ...s, ...patch }));
    return saveCalendar(patch);
  };
  // What goes into the calendar changed, so sync now instead of at the next fetch.
  const saveAndSync = async patch => {
    await save(patch);
    call('sync-now', 'Gemt. Ændringen bruges næste gang du åbner Lectio.');
  };

  let body;
  if (!GOOGLE_CLIENT_ID) {
    body = <p className="lx-calendar-text">Kræver et OAuth-klient-ID fra Google Cloud (se README).{api?.identity && <> Redirect-URI: <code>{api.identity.getRedirectURL()}</code></>}</p>;
  } else if (!settings.connected) {
    body = <>
      <p className="lx-calendar-text">Læg dit skema i en egen kalender i Google Kalender. Den opdateres af sig selv, mens du bruger Lectio.{embedded && ' Du forbinder i et lille Lectiomizer-vindue.'}</p>
      <button type="button" className="lx-button lx-button-secondary" onClick={connect} disabled={!!pending}>{pending === 'connect' ? 'Venter på Google…' : 'Forbind Google Kalender'}</button>
    </>;
  } else {
    const [last, next] = syncLines(settings, status);
    const syncing = status.state === 'syncing' || pending === 'sync-now';
    body = <>
      <Group id="lx-calendar-sync" title="Synkronisering">
        <div className="lx-sync">
          <div className="lx-sync-row">
            <p className="lx-sync-text" data-state={status.state} role="status"><strong>{last}</strong>{next && <small>{next}</small>}{status.state === 'ok' && status.message && <small>{status.message}</small>}</p>
            <button type="button" className="lx-sync-button" aria-label="Synkronisér nu" title="Synkronisér nu" onClick={() => call('sync-now')} disabled={!!pending || status.state === 'syncing'}><RefreshCw size={16} aria-hidden="true" className={syncing ? 'lx-spin' : undefined} /></button>
          </div>
          {status.reconnect && <button type="button" className="lx-button lx-button-primary" onClick={connect} disabled={!!pending}>Forbind igen</button>}
        </div>
        {/* Open Lectio tabs move their timers when the interval is saved. */}
        <label className="lx-setting"><span><strong>Hent automatisk</strong><small>Kun mens Lectio er åben</small></span><select value={intervalOf(settings).minutes} onChange={e => save({ interval: Number(e.target.value) })}>{INTERVALS.map(choice => <option key={choice.minutes} value={choice.minutes}>{choice.label}</option>)}</select></label>
      </Group>
      <Group id="lx-calendar-content" title="I kalenderen">
        <label className="lx-setting"><span><strong>Uger frem</strong><small>Fra denne uge og frem</small></span><select value={settings.weeks} onChange={e => saveAndSync({ weeks: Number(e.target.value) })}>{WEEK_CHOICES.map(n => <option key={n} value={n}>{n} {n === 1 ? 'uge' : 'uger'}</option>)}</select></label>
        <label className="lx-setting"><span><strong>Aflyste lektioner</strong><small>Vises som »Aflyst« i kalenderen</small></span><input type="checkbox" role="switch" checked={settings.cancelled} onChange={e => saveAndSync({ cancelled: e.target.checked })} /></label>
      </Group>
    </>;
  }
  const Heading = embedded ? 'h3' : 'h2';
  return <section className="lx-calendar" aria-labelledby="lx-calendar-title">
    <div className="lx-calendar-head">
      <CalendarDays size={18} aria-hidden="true" />
      <div className="lx-calendar-heading">
        <Heading id="lx-calendar-title" className="lx-calendar-title">Google Kalender</Heading>
        {settings.connected && <p className="lx-calendar-account" title={settings.email}>{settings.email || 'Forbundet'}</p>}
      </div>
      {settings.connected && <button type="button" className="lx-text-button" onClick={() => call('disconnect')} disabled={!!pending}>Afbryd</button>}
    </div>
    {body}
    {notice && <p className="lx-calendar-notice" role="alert">{notice}</p>}
  </section>;
}
