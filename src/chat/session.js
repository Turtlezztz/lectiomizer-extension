// Background side of the chat: signs in with ChatGPT, keeps the tokens and
// streams Responses API requests for the answers in jobs.js. Lectio pages
// never see a token.
//
// A browser extension can't listen on 127.0.0.1, so sign-in opens OpenAI in a
// tab and catches the browser's visit to the loopback callback: with
// webRequest before it reaches the network when Firefox lets the extension
// see that request, else from the tab's address, and as a last resort from an
// address the user pastes in.
import { api } from '../settings.js';
import { CHAT_DATA, CHAT_ORIGINS, loadAccount, saveAccount } from './store.js';
import {
  API, PLAN_SCOPE, ChatGPTError, authorizeUrl, callbackUri, errorFromBody, exchangeCode, fetchJwks, listModels,
  newHostId, pkceChallenge, randomToken, readCallback, readEvents, refreshTokens, requestBody, responseError, revokeToken, verifyIdToken,
} from './openai.js';

// The registration (issued client id, identity, refresh and id token) persists
// so the user stays signed in; the hour-long access token stays in memory.
const REGISTRATION = 'chatgptRegistration';
const HOST = 'chatgptHost';
const ACCESS = 'chatgptAccess';
// Sign-in attempts by their OAuth state, so a second click doesn't void the first tab.
const PENDING = 'chatgptAttempts';
const ATTEMPT_TTL = 15 * 60 * 1000;

const loadRegistration = async () => (await api.storage.local.get(REGISTRATION))[REGISTRATION] || {};
const saveRegistration = registration => api.storage.local.set({ [REGISTRATION]: registration });

async function hostId() {
  const { [HOST]: saved } = await api.storage.local.get(HOST);
  if (saved) return saved;
  const id = newHostId();
  await api.storage.local.set({ [HOST]: id });
  return id;
}

async function loadAttempts() {
  const { [PENDING]: attempts = {} } = await api.storage.session.get(PENDING);
  const now = Date.now();
  return Object.fromEntries(Object.entries(attempts).filter(([, a]) => now - a.startedAt < ATTEMPT_TTL));
}
const saveAttempts = attempts => api.storage.session.set({ [PENDING]: attempts });

// Data consent, plus the OpenAI and loopback hosts: Firefox may hold back host
// permissions, and without them neither the callback nor the token requests work.
export async function hasChatConsent() {
  try { return await api.permissions.contains({ origins: CHAT_ORIGINS, data_collection: CHAT_DATA }); }
  catch {
    try { return await api.permissions.contains({ origins: CHAT_ORIGINS }); } // Firefox without built-in data consent.
    catch { return true; }
  }
}

// Opens OpenAI's sign-in in a new tab. `consent` asks again for permission to
// use the ChatGPT plan after the user declined it.
export async function startSignIn({ openerTabId, consent = false } = {}) {
  const registration = await loadRegistration();
  const verifier = randomToken(48);
  const attempt = {
    state: randomToken(), nonce: randomToken(), verifier,
    redirectUri: callbackUri(49152 + Math.floor(Math.random() * 16000)),
    clientId: registration.clientId || '', startedAt: Date.now(), openerTabId: openerTabId ?? null, tabId: null,
  };
  const url = new URL(authorizeUrl({
    clientId: attempt.clientId, hostId: await hostId(), redirectUri: attempt.redirectUri,
    state: attempt.state, nonce: attempt.nonce, challenge: await pkceChallenge(verifier),
    idTokenHint: registration.idToken, loginHint: registration.email,
  }));
  if (consent) url.searchParams.set('prompt', 'consent');
  await saveAttempts({ ...await loadAttempts(), [attempt.state]: attempt });
  await saveAccount({ pending: true, message: '' });
  const tab = await api.tabs.create({ url: url.href, ...(openerTabId != null ? { openerTabId } : {}) });
  const attempts = await loadAttempts();
  if (attempts[attempt.state]) await saveAttempts({ ...attempts, [attempt.state]: { ...attempts[attempt.state], tabId: tab.id } });
  return { ok: true, started: true };
}

export async function cancelSignIn() {
  const attempts = await loadAttempts();
  await api.storage.session.remove(PENDING);
  await saveAccount({ pending: false });
  for (const attempt of Object.values(attempts)) if (attempt.tabId != null) api.tabs.remove(attempt.tabId).catch(() => {});
  return { ok: true };
}

async function finishSignIn(url, attempt) {
  try {
    const { code, clientId } = readCallback(url, attempt);
    const tokens = await exchangeCode({ clientId, code, verifier: attempt.verifier, redirectUri: attempt.redirectUri });
    const claims = await verifyIdToken(tokens.id_token, { clientId, nonce: attempt.nonce, keys: await fetchJwks() });
    const previous = await loadRegistration();
    if (attempt.clientId && previous.subject && previous.subject !== claims.sub) {
      // A client id belongs to one account; the next attempt registers anew.
      await saveRegistration({});
      throw new ChatGPTError('Du loggede ind med en anden ChatGPT-konto. Prøv igen for at bruge den.');
    }
    await saveRegistration({ clientId, subject: claims.sub, email: claims.email || '', idToken: tokens.id_token, refreshToken: tokens.refresh_token || '', scopes: tokens.scopes });
    await api.storage.session.set({ [ACCESS]: { token: tokens.access_token, expiresAt: tokens.expiresAt } });
    const planEnabled = tokens.scopes.includes(PLAN_SCOPE);
    const models = planEnabled ? await listModels({ token: tokens.access_token }).catch(() => []) : [];
    await saveAccount({ connected: true, email: claims.email || '', planEnabled, models, modelsAt: models.length ? Date.now() : 0, reconnect: false, pending: false, message: '' });
    await api.storage.session.remove(PENDING); // Other open attempts are moot now.
    return { ok: true };
  } catch (error) {
    if (error instanceof ChatGPTError && error.code === 'invalid_client') await saveRegistration({});
    const message = error instanceof ChatGPTError ? error.message : 'ChatGPT-login fejlede. Prøv igen.';
    await saveAccount({ pending: false, message });
    if (!(error instanceof ChatGPTError)) console.error('Lectiomizer:', error);
    return { ok: false, message };
  }
}

// The pending attempt a callback address belongs to, matched by its state and
// exact loopback address. Claiming it removes it, so each code is used once.
async function claim(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/auth/callback') return null;
  const attempts = await loadAttempts();
  const attempt = attempts[url.searchParams.get('state')];
  if (!attempt || `${url.origin}${url.pathname}` !== attempt.redirectUri) return null;
  delete attempts[attempt.state];
  await saveAttempts(attempts);
  return attempt;
}

// Closes the callback tab, returns to Lectio and finishes in the background;
// the chat shows "Venter på ChatGPT…" until the tokens are in.
function complete(href, attempt, tabId) {
  if (tabId != null && tabId >= 0) api.tabs.remove(tabId).catch(() => {});
  if (attempt.openerTabId != null) api.tabs.update(attempt.openerTabId, { active: true }).catch(() => {});
  return finishSignIn(href, attempt);
}

// webRequest: cancels the request before it reaches 127.0.0.1. Firefox only
// reports it when the extension may access the page that redirected there.
export async function onCallbackRequest(details) {
  const attempt = await claim(details.url);
  if (!attempt) return {};
  complete(details.url, attempt, details.tabId);
  return { cancel: true };
}

// The sign-in tab's address changed, e.g. to the loopback callback that
// webRequest didn't get to see. Nothing listens there, so nothing was received.
export async function onTabUpdated(tabId, changeInfo) {
  if (!changeInfo?.url) return;
  const attempt = await claim(changeInfo.url);
  if (attempt) complete(changeInfo.url, attempt, tabId);
}

// The user pasted the address of a callback page that wouldn't load.
export async function pasteCallback(href) {
  const attempt = await claim(String(href || '').trim());
  if (!attempt) return { ok: false, message: 'Adressen passer ikke til et login, der er i gang. Start forfra med Fortsæt med ChatGPT.' };
  return complete(String(href).trim(), attempt, attempt.tabId);
}

// The user closed OpenAI's tab before finishing.
export async function onTabRemoved(tabId) {
  const attempts = await loadAttempts();
  const left = Object.fromEntries(Object.entries(attempts).filter(([, a]) => a.tabId !== tabId));
  if (Object.keys(left).length === Object.keys(attempts).length) return;
  await saveAttempts(left);
  if (!Object.keys(left).length) await saveAccount({ pending: false });
}

// Valid access token, refreshed near expiry. Refreshes are serialised because
// each one rotates the refresh token.
let refreshing = null;
async function accessToken({ force = false } = {}) {
  const { [ACCESS]: access } = await api.storage.session.get(ACCESS);
  if (!force && access && access.expiresAt - 120000 > Date.now()) return access.token;
  refreshing ??= (async () => {
    const registration = await loadRegistration();
    if (!registration.refreshToken) throw new ChatGPTError('Log ind med ChatGPT.', { kind: 'reconnect' });
    try {
      const tokens = await refreshTokens({ clientId: registration.clientId, refreshToken: registration.refreshToken });
      await saveRegistration({ ...registration, refreshToken: tokens.refresh_token || registration.refreshToken, idToken: tokens.id_token || registration.idToken, scopes: tokens.scopes.length ? tokens.scopes : registration.scopes });
      await api.storage.session.set({ [ACCESS]: { token: tokens.access_token, expiresAt: tokens.expiresAt } });
      return tokens.access_token;
    } catch (error) {
      if (error.kind === 'reconnect') await signedOut('Din ChatGPT-adgang er udløbet. Log ind igen.');
      throw error;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

// Tokens are unusable: keep the registration (client id, identity) for the
// next sign-in, drop the credentials.
async function signedOut(message) {
  const registration = await loadRegistration();
  await saveRegistration({ clientId: registration.clientId, subject: registration.subject, email: registration.email });
  await api.storage.session.remove(ACCESS);
  await saveAccount({ connected: false, planEnabled: false, reconnect: !!message, message: message || '' });
}

export async function signOut() {
  const registration = await loadRegistration();
  let revoked = !registration.refreshToken;
  for (let attempt = 0; !revoked && attempt < 3; attempt++) {
    try { await revokeToken({ clientId: registration.clientId, refreshToken: registration.refreshToken }); revoked = true; }
    catch { await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); }
  }
  await signedOut('');
  await saveAccount({ email: '', models: [], modelsAt: 0, message: revoked ? '' : 'Du er logget ud her, men ChatGPT bekræftede ikke afmeldingen. Du kan fjerne Lectiomizer under Indstillinger i ChatGPT.' });
  return { ok: true };
}

export async function refreshModels() {
  try {
    const models = await listModels({ token: await accessToken() });
    await saveAccount({ models, modelsAt: Date.now() });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

// Events the chat turn needs; the rest of the stream is dropped here.
const FORWARD = new Set(['response.output_text.delta', 'response.output_item.added', 'response.output_item.done', 'response.incomplete']);

// Pauses before retrying a request ChatGPT turned away for a moment (e.g.
// "server_is_overloaded"). Tests shorten them.
export const retry = { delays: [1500, 4000, 8000] };
const pause = (ms, signal) => new Promise(resolve => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});
const aborted = () => new DOMException('Stoppet', 'AbortError');

// One request to the Responses API, yielding events as they arrive.
async function* streamOnce(body, signal) {
  let response;
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken({ force: attempt > 0 });
    response = await fetch(`${API}/responses`, {
      method: 'POST', credentials: 'omit', signal, body,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    });
    if (response.status === 401 && attempt === 0) continue;
    if (!response.ok) {
      const error = await responseError(response);
      console.warn('Lectiomizer: ChatGPT svarede', response.status, error.code, error.detail, error.requestId);
      throw error;
    }
    break;
  }
  for await (const event of readEvents(response.body, signal)) {
    if (FORWARD.has(event.type)) yield event;
    else if (event.type === 'response.completed') { yield { type: event.type, usage: event.response?.usage || null }; return; }
    else if (event.type === 'response.failed' || event.type === 'error') {
      // Kept in the background console (about:debugging → Inspect) for diagnosis.
      console.warn('Lectiomizer: ChatGPT-fejl i svaret', JSON.stringify(event).slice(0, 4000));
      const error = errorFromBody(0, event);
      error.requestId = response.headers.get('x-request-id') || '';
      throw error;
    }
  }
  throw new ChatGPTError('Svaret fra ChatGPT blev afbrudt. Prøv igen.', { kind: 'retry' });
}

// A Responses request ({ model, instructions, input, tools, effort }) as a
// stream of events. Busy servers and dropped connections are retried while
// nothing has been shown, with an 'lx.retrying' event so the chat can say so.
export async function* responses(request, signal) {
  if (!await hasChatConsent()) throw new ChatGPTError('Giv Lectiomizer lov til at sende Lectio-indhold til ChatGPT: log ud og ind igen fra Lectiomizer-vinduet.', { kind: 'consent' });
  if (!(await loadAccount()).connected) throw new ChatGPTError('Log ind med ChatGPT.', { kind: 'reconnect' });
  const body = JSON.stringify(requestBody(request));
  for (let attempt = 0; ; attempt++) {
    let shown = false;
    try {
      for await (const event of streamOnce(body, signal)) {
        if (event.type !== 'response.completed') shown = true;
        yield event;
      }
      return;
    } catch (error) {
      if (signal?.aborted) throw aborted();
      const known = error instanceof ChatGPTError ? error : new ChatGPTError('Kunne ikke nå ChatGPT. Tjek din forbindelse og prøv igen.', { kind: 'retry' });
      if (!(error instanceof ChatGPTError)) console.warn('Lectiomizer:', error);
      if (shown || known.kind !== 'retry' || attempt >= retry.delays.length) {
        if (known.kind === 'reconnect' && known.status === 401) await signedOut('Log ind med ChatGPT igen.');
        throw known;
      }
      yield { type: 'lx.retrying', attempt: attempt + 1 };
      await pause(retry.delays[attempt], signal);
      if (signal?.aborted) throw aborted();
    }
  }
}
