// Google Calendar connection and sync, run in the background script. The
// access token lives in session storage (memory only, gone when the browser
// closes); silent renewal uses the saved Google email as login hint.
import { browser } from 'wxt/browser';
import { GoogleError, authorize, createClient, ensureCalendar, syncCalendar } from './google.js';
import { weeksFrom } from '../lectio/readers/schedule.js';
import { BUILT_IN_CLIENT_ID, loadPrefs, savePrefs, saveCalendarStatus } from './store';
import type { Week } from './read';


/** Client id from Indstillinger, else the one baked in at build time. */
async function clientId(): Promise<string> {
  return (await loadPrefs()).googleClientId.trim() || BUILT_IN_CLIENT_ID;
}

const session = (browser.storage as any).session ?? browser.storage.local;

let renewal: Promise<string> | null = null;
async function getToken({ refresh = false } = {}): Promise<string> {
  const { googleToken: saved } = (await session.get('googleToken')) as { googleToken?: { token: string; expires: number; obtained: number } };
  const valid = saved && saved.expires - 60_000 > Date.now();
  // A token renewed seconds ago answers parallel requests' 401s too.
  if (valid && (!refresh || Date.now() - saved.obtained < 10_000)) return saved!.token;
  renewal ??= (async () => {
    const { email } = await loadPrefs();
    const fresh = { ...(await authorize(browser.identity, await clientId(), { interactive: false, hint: email })), obtained: Date.now() };
    await session.set({ googleToken: fresh });
    return fresh.token as string;
  })().finally(() => {
    renewal = null;
  });
  return renewal as Promise<string>;
}

const client = createClient({ getToken });

export async function connectGoogle(): Promise<{ ok: boolean; message?: string }> {
  const id = await clientId();
  if (!id) return { ok: false, message: 'Indtast et Google-klient-ID først.' };
  try {
    // Firefox's launchWebAuthFlow window can fail to open at all; a tab always does.
    const auth = await authorize(browser.identity, id, { interactive: true, tabs: import.meta.env.FIREFOX ? browser.tabs : null });
    await session.set({ googleToken: { ...auth, obtained: Date.now() } });
    const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then((r): Promise<{ email?: string }> => (r.ok ? r.json() : Promise.resolve({})))
      .catch((): { email?: string } => ({}));
    const prefs = await loadPrefs();
    const calendarId = await ensureCalendar(client, prefs.calendarId);
    await savePrefs({ connected: true, email: profile.email || '', calendarId });
    await saveCalendarStatus({ state: 'idle', message: '', checkedAt: 0, reconnect: false });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof GoogleError ? error.message : 'Kunne ikke forbinde til Google.' };
  }
}

export async function disconnectGoogle() {
  const { googleToken } = (await session.get('googleToken')) as { googleToken?: { token: string } };
  await session.remove('googleToken');
  // The calendar id is kept so reconnecting reuses the same calendar.
  await savePrefs({ connected: false, email: '' });
  await saveCalendarStatus({ state: 'idle', message: '', checkedAt: 0, syncedAt: 0, reconnect: false });
  if (googleToken) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: googleToken.token }),
    }).catch(() => {});
  }
  return { ok: true };
}

/** Firefox: website content leaves the browser only with the user's data consent. */
async function hasConsent() {
  try {
    return await (browser.permissions as any).contains({ data_collection: ['websiteContent'] });
  } catch {
    return true; // Chrome / older Firefox: no built-in data consent.
  }
}

let running: Promise<unknown> = Promise.resolve();

/** Push the read weeks (only those within the chosen range) to Google. */
export function syncToGoogle(weeks: Week[], now = Date.now()) {
  const run = running.then(async () => {
    const prefs = await loadPrefs();
    if (!prefs.connected) return { ok: false };
    const wanted = new Set(weeksFrom(new Date(now), prefs.weeks).map((w: { dates: string[] }) => w.dates[0]));
    const read = weeks.filter((w) => !w.error && wanted.has(w.dates[0]));
    const unread = prefs.weeks - read.length;
    if (!read.length) return { ok: false };
    const finish = (patch: object) => saveCalendarStatus({ checkedAt: Date.now(), ...patch });
    if (!(await hasConsent())) {
      const message = 'Giv Lectiomizer lov til at sende skemaet til Google: afbryd og forbind igen.';
      await finish({ state: 'error', message, reconnect: true });
      return { ok: false, message };
    }
    await saveCalendarStatus({ state: 'syncing', startedAt: Date.now(), message: '' });
    try {
      const calendarId = await ensureCalendar(client, prefs.calendarId);
      if (calendarId !== prefs.calendarId) await savePrefs({ calendarId });
      const result = await syncCalendar(client, { calendarId, weeks: read, cancelled: prefs.cancelled });
      const message = unread > 0 ? `${unread} af ${prefs.weeks} uger kunne ikke læses og blev sprunget over.` : '';
      await finish({ state: 'ok', message, syncedAt: Date.now(), lessons: result.lessons, weeks: read.length, reconnect: false });
      return { ok: true, ...result };
    } catch (error) {
      const known = error instanceof GoogleError;
      await finish({ state: 'error', message: known ? error.message : 'Synkroniseringen fejlede.', reconnect: known && (error as any).reconnect });
      if (!known) console.error('Lectiomizer:', error);
      return { ok: false, message: (error as Error).message };
    }
  });
  running = run.catch(() => {});
  return run;
}
