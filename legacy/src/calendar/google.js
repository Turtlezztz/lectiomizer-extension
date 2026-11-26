// Google Calendar access for the background script. Uses the narrow
// calendar.app.created scope: the extension can only see and change the one
// calendar it creates, never the user's other calendars.
import { TIME_ZONE, SOURCE, lessonToEvent, planSync } from './events.js';

const API = 'https://www.googleapis.com/calendar/v3';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const SCOPES = [CALENDAR_SCOPE, 'email'];

export class GoogleError extends Error {
  constructor(message, { status = 0, reason = '', reconnect = false } = {}) {
    super(message);
    this.name = 'GoogleError';
    Object.assign(this, { status, reason, reconnect });
  }
}

const authMessages = {
  access_denied: 'Du afviste adgangen i Google.',
  scope: 'Giv adgang til at oprette kalendere, når Google spørger.',
  interaction_required: 'Log ind på Google igen for at fortsætte synkroniseringen.',
};

// Implicit grant: Firefox has no Google-specific identity API, and a token is
// all the extension needs. Silent renewal uses prompt=none with the saved email.
export async function authorize(identity, clientId, { interactive, hint = '' }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: identity.getRedirectURL(),
    scope: SCOPES.join(' '),
    ...(interactive ? {} : { prompt: 'none' }),
    ...(hint ? { login_hint: hint } : {}),
  });
  let redirect;
  try {
    redirect = new URL(await identity.launchWebAuthFlow({ url: url.href, interactive }));
  } catch (error) {
    throw new GoogleError(interactive ? 'Google-login blev afbrudt.' : authMessages.interaction_required, { reconnect: !interactive });
  }
  const params = new URLSearchParams(redirect.hash.slice(1) || redirect.search);
  const error = params.get('error');
  if (error) throw new GoogleError(authMessages[error] || authMessages.interaction_required, { reason: error, reconnect: true });
  if (!(params.get('scope') || '').split(' ').includes(CALENDAR_SCOPE)) throw new GoogleError(authMessages.scope, { reason: 'scope', reconnect: true });
  return { token: params.get('access_token'), expires: Date.now() + Number(params.get('expires_in') || 3600) * 1000 };
}

// getToken({ refresh }) returns a valid access token. wait() is injectable so
// tests don't sleep through the backoff.
export function createClient({ getToken, fetch = globalThis.fetch, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  async function request(method, path, { query, body } = {}) {
    const url = new URL(API + path);
    for (const [key, value] of Object.entries(query || {})) if (value != null) url.searchParams.set(key, value);
    let refresh = false;
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await getToken({ refresh });
      refresh = false;
      const response = await fetch(url.href, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok) return response.status === 204 ? null : response.json();
      const error = (await response.json().catch(() => ({}))).error || {};
      const reason = error.errors?.[0]?.reason || '';
      if (response.status === 401 && !renewed) { refresh = renewed = true; continue; }
      const limited = response.status === 429 || response.status >= 500 || /rateLimitExceeded/i.test(reason);
      if (limited && attempt < 4) { await wait(500 * 2 ** attempt); continue; }
      throw new GoogleError(error.message || `Google svarede ${response.status}`, { status: response.status, reason, reconnect: response.status === 401 });
    }
  }
  return { request };
}

const enc = encodeURIComponent;

// Reuses the saved calendar; creates a new one if it was deleted in Google.
export async function ensureCalendar(client, calendarId) {
  if (calendarId) {
    try { await client.request('GET', `/calendars/${enc(calendarId)}`, { query: { fields: 'id' } }); return calendarId; }
    catch (error) { if (error.status !== 404 && error.status !== 403) throw error; }
  }
  const created = await client.request('POST', '/calendars', {
    body: { summary: 'Lectio', description: 'Dit skema fra Lectio. Synkroniseres af Lectiomizer; ændringer her bliver overskrevet.', timeZone: TIME_ZONE },
  });
  return created.id;
}

async function listEvents(client, calendarId, from, to) {
  const events = [];
  let pageToken;
  do {
    const page = await client.request('GET', `/calendars/${enc(calendarId)}/events`, {
      query: {
        timeMin: `${from}T00:00:00Z`, timeMax: `${to}T00:00:00Z`, timeZone: TIME_ZONE,
        privateExtendedProperty: `lxSource=${SOURCE}`, singleEvents: 'true', maxResults: '2500',
        fields: 'items(id,start,extendedProperties),nextPageToken', pageToken,
      },
    });
    events.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

async function pool(tasks, size) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]();
  }));
}

const shift = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// weeks: [{ dates: ['YYYY-MM-DD', …], lessons }] read from Lectio.
export async function syncCalendar(client, { calendarId, weeks, cancelled = true }) {
  const dates = new Set(weeks.flatMap(week => Array.isArray(week?.dates) ? week.dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []));
  if (!dates.size) return { lessons: 0, added: 0, updated: 0, removed: 0 };
  const desired = new Map();
  for (const lesson of weeks.flatMap(week => Array.isArray(week?.lessons) ? week.lessons : [])) {
    if (!cancelled && lesson?.status === 'cancelled') continue;
    const event = lessonToEvent(lesson);
    if (event && dates.has(event.date) && !desired.has(event.id)) desired.set(event.id, event);
  }
  const sorted = Array.from(dates).sort();
  // A day of margin on each side covers the UTC offset; planSync filters by local date.
  const existing = await listEvents(client, calendarId, shift(sorted[0], -1), shift(sorted.at(-1), 2));
  const plan = planSync(Array.from(desired.values()), existing, dates);
  const events = `/calendars/${enc(calendarId)}/events`;
  const gone = error => { if (error.status !== 404 && error.status !== 410) throw error; };
  await pool([
    ...plan.insert.map(event => () => client.request('POST', events, { body: event.body })),
    ...plan.update.map(event => () => client.request('PUT', `${events}/${enc(event.eventId)}`, { body: event.body })),
    ...plan.remove.map(id => () => client.request('DELETE', `${events}/${enc(id)}`).catch(gone)),
  ], 4);
  return { lessons: desired.size, added: plan.insert.length, updated: plan.update.length, removed: plan.remove.length };
}
