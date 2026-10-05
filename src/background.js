// Background script: owns the Google and ChatGPT tokens and every call to
// Google and OpenAI. Content scripts send it lessons they read from Lectio and
// chat questions, whose answers run here (chat/jobs.js); the popup connects,
// and the popup or the page's settings card disconnects. Nothing is sent to Google or OpenAI until the user connects.
import { api } from './settings.js';
import { cancelSignIn, hasChatConsent, onCallbackRequest, onTabRemoved, onTabUpdated, pasteCallback, refreshModels, signOut, startSignIn } from './chat/session.js';
import { resetActivity, retryAnswer, send, stop, watch } from './chat/jobs.js';
import { GOOGLE_CLIENT_ID, loadCalendar, saveCalendar, saveCalendarStatus } from './calendar/store.js';
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
      await finish({ state: 'error', message: known ? error.message : 'Synkroniseringen fejlede.', reconnect: known && error.reconnect });
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

// Firefox asks for data consent only on extension pages, so the settings card
// and chat page in a Lectio page connect through the popup, opened as a small
// window.
async function openSettings() {
  if (!api.windows) return { ok: false, message: 'Åbn Lectiomizer fra værktøjslinjen for at forbinde.' };
  await api.windows.create({ type: 'popup', url: api.runtime.getURL('popup.html'), width: 380, height: 680 });
  return { ok: true };
}

api.runtime.onMessage.addListener((message, sender) => {
  // Only extension pages (the popup) may connect. Lectio pages' settings card
  // may disconnect, start a sync, or open the popup to connect.
  const fromExtension = !sender.tab && sender.id === api.runtime.id;
  const fromLectio = !!sender.tab && isLectio(sender.url);
  switch (message?.type) {
    case 'calendar:sync':
      if (fromLectio && Array.isArray(message.weeks)) return sync(message.weeks, Number(message.unread) || 0);
      return;
    case 'calendar:connect': if (fromExtension) return connect(); return;
    case 'calendar:disconnect': if (fromExtension || fromLectio) return disconnect(); return;
    case 'calendar:sync-now': if (fromExtension || fromLectio) return requestSync(); return;
    case 'calendar:open-settings': if (fromLectio) return openSettings(); return;
    // The chat page in Lectio signs in directly once the user has given data
    // consent; otherwise the popup asks for it first.
    case 'chat:connect':
      if (fromExtension) return startSignIn({ consent: !!message.consent });
      if (fromLectio) return hasChatConsent().then(granted => granted ? startSignIn({ openerTabId: sender.tab.id, consent: !!message.consent }) : openSettings());
      return;
    case 'chat:cancel': if (fromExtension || fromLectio) return cancelSignIn(); return;
    case 'chat:callback': if (fromExtension || fromLectio) return pasteCallback(message.url); return;
    case 'chat:disconnect': if (fromExtension || fromLectio) return signOut(); return;
    case 'chat:models': if (fromExtension || fromLectio) return refreshModels(); return;
    // Answers run here and carry on when the student leaves the Chat page.
    case 'chat:send': if (fromLectio) return send(message, sender); return;
    case 'chat:retry': if (fromLectio) return retryAnswer(message, sender); return;
    case 'chat:stop': if (fromLectio) return stop(message); return;
  }
});

api.runtime.onConnect.addListener(port => {
  const sender = port.sender || {};
  if (port.name === 'chat' && sender.tab && isLectio(sender.url)) watch(port);
  else if (port.name === 'chat') port.disconnect();
});

// Sign in with ChatGPT returns to a loopback address. Catch it before it
// reaches the network where Firefox allows, else from the tab's address.
try {
  api.webRequest.onBeforeRequest.addListener(onCallbackRequest, { urls: ['http://127.0.0.1/*'], types: ['main_frame'] }, ['blocking']);
} catch (error) {
  console.warn('Lectiomizer: ChatGPT-login kan ikke opfanges med webRequest:', error);
}
api.tabs.onUpdated.addListener((tabId, changeInfo) => { onTabUpdated(tabId, changeInfo).catch(() => {}); }, { urls: ['http://127.0.0.1/*'], properties: ['url'] });
api.tabs.onRemoved.addListener(tabId => { onTabRemoved(tabId).catch(() => {}); });
resetActivity().catch(() => {});
