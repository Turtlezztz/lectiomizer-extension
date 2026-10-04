// Background script: owns the Google token and every call to Google. Content
// scripts send it lessons they read from Lectio; the popup connects and
// disconnects. Nothing is sent to Google until the user connects.
import { api, GOOGLE_CLIENT_ID, loadCalendar, saveCalendar, saveCalendarStatus } from './settings.js';
import { GoogleError, authorize, createClient, ensureCalendar, syncCalendar } from './calendar/google.js';

const LECTIO = ['https://www.lectio.dk/*', 'https://lectio.dk/*'];
const isLectio = url => /^https:\/\/(www\.)?lectio\.dk\//.test(url || '');

// The token lives in session storage: kept while Firefox runs, never on disk.
// Parallel requests that find it expired share one silent renewal.
let renewal = null;
async function getToken({ refresh = false } = {}) {
  const { googleToken: saved } = await api.storage.session.get('googleToken');
  const valid = saved && saved.expires - 60000 > Date.now();
  // A token renewed seconds ago is the answer to the other requests' 401s too.
  if (valid && (!refresh || Date.now() - saved.obtained < 10000)) return saved.token;
  renewal ??= (async () => {
    const { email } = await loadCalendar();
    const fresh = { ...await authorize(api.identity, GOOGLE_CLIENT_ID, { interactive: false, hint: email }), obtained: Date.now() };
    await api.storage.session.set({ googleToken: fresh });
    return fresh.token;
  })().finally(() => { renewal = null; });
  return renewal;
}

const client = createClient({ getToken });

// Websites' content leaves the browser only with the user's data consent.
async function hasConsent() {
  try { return await api.permissions.contains({ data_collection: ['websiteContent'] }); }
  catch { return true; } // Firefox without built-in data consent.
}

async function connect() {
  if (!GOOGLE_CLIENT_ID) return { ok: false, message: 'Lectiomizer er bygget uden et Google-klient-ID.' };
  try {
    const auth = await authorize(api.identity, GOOGLE_CLIENT_ID, { interactive: true });
    await api.storage.session.set({ googleToken: { ...auth, obtained: Date.now() } });
    const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${auth.token}` } }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const settings = await loadCalendar();
    const calendarId = await ensureCalendar(client, settings.calendarId);
    await saveCalendar({ connected: true, email: profile.email || '', calendarId });
    await saveCalendarStatus({ state: 'idle', message: '', checkedAt: 0, reconnect: false });
    requestSync().catch(() => {});
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof GoogleError ? error.message : 'Kunne ikke forbinde til Google.' };
  }
}

async function disconnect() {
  const { googleToken } = await api.storage.session.get('googleToken');
  await api.storage.session.remove('googleToken');
  // The calendar id is kept so reconnecting reuses the same calendar.
  await saveCalendar({ connected: false, email: '' });
  await saveCalendarStatus({ state: 'idle', message: '', checkedAt: 0, syncedAt: 0, reconnect: false });
  if (googleToken) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: googleToken.token }) }).catch(() => {});
  return { ok: true };
}

let running = Promise.resolve();
function sync(weeks, unread) {
  const run = running.then(async () => {
    const settings = await loadCalendar();
    if (!settings.connected) return { ok: false };
    const finish = patch => saveCalendarStatus({ checkedAt: Date.now(), ...patch });
    if (!await hasConsent()) {
      const message = 'Giv Lectiomizer lov til at sende skemaet til Google: afbryd og forbind igen.';
      await finish({ state: 'error', message, reconnect: true });
      return { ok: false, message };
    }
    try {
      const calendarId = await ensureCalendar(client, settings.calendarId);
      if (calendarId !== settings.calendarId) await saveCalendar({ calendarId });
      const result = await syncCalendar(client, { calendarId, weeks, cancelled: settings.cancelled });
      const message = unread ? `${unread} af ${weeks.length + unread} uger kunne ikke læses og blev sprunget over.` : '';
      await finish({ state: 'ok', message, syncedAt: Date.now(), lessons: result.lessons, weeks: weeks.length, reconnect: false });
      return { ok: true, ...result };
    } catch (error) {
      const known = error instanceof GoogleError;
      await finish({ state: 'error', message: known ? error.message : 'Synkroniseringen fejlede. Prøver igen om en time.', reconnect: known && error.reconnect });
      if (!known) console.error('Lectiomizer:', error);
      return { ok: false, message: error.message };
    }
  });
  running = run.catch(() => {});
  return run;
}

// Ask an open Lectio tab to read the schedule; only it has the Lectio session.
async function requestSync() {
  const tabs = await api.tabs.query({ url: LECTIO });
  tabs.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  for (const tab of tabs) {
    try {
      const result = await api.tabs.sendMessage(tab.id, { type: 'calendar:sync-now' }, { frameId: 0 });
      if (result?.started || result?.busy) return { ok: true, ...result };
    } catch {}
  }
  return { ok: false, message: 'Åbn Lectio og log ind, så synkroniseres skemaet.' };
}

api.runtime.onMessage.addListener((message, sender) => {
  // Only extension pages (the popup) may connect, disconnect or start a sync.
  const fromExtension = !sender.tab && sender.id === api.runtime.id;
  switch (message?.type) {
    case 'calendar:sync':
      if (sender.tab && isLectio(sender.url) && Array.isArray(message.weeks)) return sync(message.weeks, Number(message.unread) || 0);
      return;
    case 'calendar:connect': if (fromExtension) return connect(); return;
    case 'calendar:disconnect': if (fromExtension) return disconnect(); return;
    case 'calendar:sync-now': if (fromExtension) return requestSync(); return;
  }
});
