import React, { useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { api, CALENDAR_DEFAULTS, GOOGLE_CLIENT_ID, loadCalendar, loadCalendarStatus, saveCalendar } from '../settings.js';

const clock = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
function when(time) {
  const date = new Date(time);
  const today = new Date().toDateString() === date.toDateString();
  return `${today ? '' : `${date.getDate()}/${date.getMonth() + 1} `}kl. ${clock.format(date)}`;
}

function statusText(status) {
  if (status.state === 'syncing') return 'Synkroniserer…';
  if (status.state === 'error') return status.message;
  if (status.syncedAt) return `Synkroniseret ${when(status.syncedAt)} · ${status.lessons} ${status.lessons === 1 ? 'lektion' : 'lektioner'}`;
  return 'Synkroniseres næste gang du åbner Lectio.';
}

export function CalendarPanel() {
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
    // Firefox only shows the data consent prompt from inside the click.
    let consent;
    try { consent = api.permissions.request({ data_collection: ['websiteContent'] }); }
    catch { consent = Promise.resolve(true); }
    consent.catch(() => true).then(granted => granted ? call('connect') : setNotice('Uden din tilladelse sendes skemaet ikke til Google.'));
  };
  const update = async patch => {
    setSettings(s => ({ ...s, ...patch }));
    await saveCalendar(patch);
    call('sync-now', 'Gemt. Ændringen bruges næste gang du åbner Lectio.');
  };

  let body;
  if (!GOOGLE_CLIENT_ID) {
    body = <p className="calendar-text">Kræver et OAuth-klient-ID fra Google Cloud (se README). Redirect-URI: <code>{api?.identity?.getRedirectURL()}</code></p>;
  } else if (!settings.connected) {
    body = <>
      <p className="calendar-text">Læg dit skema i en egen kalender i Google Kalender. Den opdateres af sig selv, mens du bruger Lectio.</p>
      <button type="button" className="button button-secondary" onClick={connect} disabled={!!pending}>{pending === 'connect' ? 'Venter på Google…' : 'Forbind Google Kalender'}</button>
    </>;
  } else {
    body = <>
      <p className="calendar-account" title={settings.email}>{settings.email || 'Forbundet'}</p>
      <p className="calendar-status" data-state={status.state} role="status">{statusText(status)}</p>
      {status.state === 'ok' && status.message && <p className="calendar-status">{status.message}</p>}
      {status.reconnect && <button type="button" className="button button-primary calendar-reconnect" onClick={connect} disabled={!!pending}>Forbind igen</button>}
      <label className="setting"><span><strong>Uger frem</strong><small>Fra denne uge og frem</small></span><select value={settings.weeks} onChange={e => update({ weeks: Number(e.target.value) })}>{[1, 2, 4, 8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'uge' : 'uger'}</option>)}</select></label>
      <label className="setting"><span><strong>Aflyste lektioner</strong><small>Vises som »Aflyst« i kalenderen</small></span><input type="checkbox" role="switch" checked={settings.cancelled} onChange={e => update({ cancelled: e.target.checked })} /></label>
      <button type="button" className="button button-secondary" onClick={() => call('sync-now')} disabled={!!pending || status.state === 'syncing'}><RefreshCw size={16} aria-hidden="true" />{status.state === 'syncing' || pending === 'sync-now' ? 'Synkroniserer…' : 'Synkronisér nu'}</button>
    </>;
  }
  return <section className="calendar" aria-labelledby="lx-calendar-title">
    <div className="calendar-head">
      <CalendarDays size={18} aria-hidden="true" />
      <h2 id="lx-calendar-title">Google Kalender</h2>
      {settings.connected && <button type="button" className="text-button" onClick={() => call('disconnect')} disabled={!!pending}>Afbryd</button>}
    </div>
    {body}
    {notice && <p className="error calendar-notice" role="alert">{notice}</p>}
  </section>;
}
