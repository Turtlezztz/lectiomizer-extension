// Background side of Sign in with ChatGPT (ported from v1's chat/session.js):
// starts the sign-in, catches the loopback callback, keeps the tokens and
// hands a fresh access token to the app's chat. Refreshes happen only here,
// because every refresh rotates the refresh token.
//
// An extension can't listen on 127.0.0.1, so sign-in opens OpenAI in a tab
// and catches the tab's navigation to the loopback callback (the `tabs`
// permission lets us see it), or, as a last resort, an address the student
// pastes in.
import { loadAccount, saveAccount, hasChatPermissions } from './account';
import {
  PLAN_SCOPE,
  ChatGPTError,
  authorizeUrl,
  callbackUri,
  exchangeCode,
  fetchJwks,
  listModels,
  newHostId,
  pkceChallenge,
  randomToken,
  readCallback,
  refreshTokens,
  revokeToken,
  verifyIdToken,
} from './openai.js';

const api = () => (globalThis as any).browser ?? (globalThis as any).chrome;

// The registration (issued client id, identity, refresh and id token) persists
// so the student stays signed in; the hour-long access token stays in session storage.
const REGISTRATION = 'chatgptRegistration';
const HOST = 'chatgptHost';
const ACCESS = 'chatgptAccess';
// Sign-in attempts by their OAuth state, so a second click doesn't void the first tab.
const PENDING = 'chatgptAttempts';
const ATTEMPT_TTL = 15 * 60 * 1000;

interface Registration {
  clientId?: string;
  subject?: string;
  email?: string;
  idToken?: string;
  refreshToken?: string;
  scopes?: string[];
}
interface Attempt {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  startedAt: number;
  openerTabId: number | null;
  tabId: number | null;
}

const loadRegistration = async (): Promise<Registration> => (await api().storage.local.get(REGISTRATION))[REGISTRATION] || {};
const saveRegistration = (registration: Registration) => api().storage.local.set({ [REGISTRATION]: registration });

async function hostId(): Promise<string> {
  const { [HOST]: saved } = await api().storage.local.get(HOST);
  if (saved) return saved;
  const id = newHostId();
  await api().storage.local.set({ [HOST]: id });
  return id;
}

async function loadAttempts(): Promise<Record<string, Attempt>> {
  const { [PENDING]: attempts = {} } = await api().storage.session.get(PENDING);
  const now = Date.now();
  return Object.fromEntries(Object.entries(attempts as Record<string, Attempt>).filter(([, a]) => now - a.startedAt < ATTEMPT_TTL));
}
const saveAttempts = (attempts: Record<string, Attempt>) => api().storage.session.set({ [PENDING]: attempts });

/** Opens OpenAI's sign-in in a new tab. `consent` asks again for the plan after the student declined it. */
export async function startSignIn({ openerTabId = null, consent = false }: { openerTabId?: number | null; consent?: boolean } = {}) {
  if (!(await hasChatPermissions())) return { ok: false, message: 'Giv Lectiomizer lov til at kontakte ChatGPT først.' };
  const registration = await loadRegistration();
  const verifier = randomToken(48);
  const attempt: Attempt = {
    state: randomToken(),
    nonce: randomToken(),
    verifier,
    redirectUri: callbackUri(49152 + Math.floor(Math.random() * 16000)),
    clientId: registration.clientId || '',
    startedAt: Date.now(),
    openerTabId,
    tabId: null,
  };
  const url = new URL(
    authorizeUrl({
      clientId: attempt.clientId,
      hostId: await hostId(),
      redirectUri: attempt.redirectUri,
      state: attempt.state,
      nonce: attempt.nonce,
      challenge: await pkceChallenge(verifier),
      idTokenHint: registration.idToken,
      loginHint: registration.email,
    }),
  );
  if (consent) url.searchParams.set('prompt', 'consent');
  await saveAttempts({ ...(await loadAttempts()), [attempt.state]: attempt });
  await saveAccount({ pending: true, message: '' });
  const tab = await api().tabs.create({ url: url.href, ...(openerTabId != null ? { openerTabId } : {}) });
  const attempts = await loadAttempts();
  if (attempts[attempt.state]) await saveAttempts({ ...attempts, [attempt.state]: { ...attempts[attempt.state], tabId: tab.id } });
  return { ok: true, started: true };
}

export async function cancelSignIn() {
  const attempts = await loadAttempts();
  await api().storage.session.remove(PENDING);
  await saveAccount({ pending: false });
  for (const attempt of Object.values(attempts)) if (attempt.tabId != null) api().tabs.remove(attempt.tabId).catch(() => {});
  return { ok: true };
}

async function finishSignIn(url: string, attempt: Attempt) {
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
    await api().storage.session.set({ [ACCESS]: { token: tokens.access_token, expiresAt: tokens.expiresAt } });
    const planEnabled = tokens.scopes.includes(PLAN_SCOPE);
    const models = planEnabled ? await listModels({ token: tokens.access_token }).catch(() => []) : [];
    await saveAccount({ connected: true, email: claims.email || '', planEnabled, models, modelsAt: models.length ? Date.now() : 0, reconnect: false, pending: false, message: '' });
    await api().storage.session.remove(PENDING);
    return { ok: true };
  } catch (error: any) {
    if (error instanceof ChatGPTError && (error as any).code === 'invalid_client') await saveRegistration({});
    const message = error instanceof ChatGPTError ? error.message : 'ChatGPT-login fejlede. Prøv igen.';
    await saveAccount({ pending: false, message });
    if (!(error instanceof ChatGPTError)) console.error('Lectiomizer:', error);
    return { ok: false, message };
  }
}

/** The pending attempt a callback address belongs to. Claiming removes it, so each code is used once. */
async function claim(href: string): Promise<Attempt | null> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/auth/callback') return null;
  const attempts = await loadAttempts();
  const attempt = attempts[url.searchParams.get('state') || ''];
  if (!attempt || `${url.origin}${url.pathname}` !== attempt.redirectUri) return null;
  delete attempts[attempt.state];
  await saveAttempts(attempts);
  return attempt;
}

function complete(href: string, attempt: Attempt, tabId: number | null) {
  if (tabId != null && tabId >= 0) api().tabs.remove(tabId).catch(() => {});
  if (attempt.openerTabId != null) api().tabs.update(attempt.openerTabId, { active: true }).catch(() => {});
  return finishSignIn(href, attempt);
}

/** tabs.onUpdated: the sign-in tab went to the loopback callback (nothing listens there). */
export async function onTabUpdated(tabId: number, changeInfo: { url?: string }) {
  if (!changeInfo?.url || !changeInfo.url.startsWith('http://127.0.0.1')) return;
  const attempt = await claim(changeInfo.url);
  if (attempt) await complete(changeInfo.url, attempt, tabId);
}

/** The student pasted the address of a callback page that wouldn't load. */
export async function pasteCallback(href: unknown) {
  const value = String(href || '').trim();
  const attempt = await claim(value);
  if (!attempt) return { ok: false, message: 'Adressen passer ikke til et login, der er i gang. Start forfra med Fortsæt med ChatGPT.' };
  return complete(value, attempt, attempt.tabId);
}

/** The student closed OpenAI's tab before finishing. */
export async function onTabRemoved(tabId: number) {
  const attempts = await loadAttempts();
  const left = Object.fromEntries(Object.entries(attempts).filter(([, a]) => a.tabId !== tabId));
  if (Object.keys(left).length === Object.keys(attempts).length) return;
  await saveAttempts(left);
  if (!Object.keys(left).length) await saveAccount({ pending: false });
}

// Valid access token, refreshed near expiry. Refreshes are serialised because
// each one rotates the refresh token.
let refreshing: Promise<string> | null = null;
export async function accessToken({ force = false } = {}): Promise<string> {
  const { [ACCESS]: access } = await api().storage.session.get(ACCESS);
  if (!force && access && access.expiresAt - 120_000 > Date.now()) return access.token;
  refreshing ??= (async () => {
    const registration = await loadRegistration();
    if (!registration.refreshToken) throw new ChatGPTError('Log ind med ChatGPT.', { kind: 'reconnect' });
    try {
      const tokens = await refreshTokens({ clientId: registration.clientId, refreshToken: registration.refreshToken });
      await saveRegistration({
        ...registration,
        refreshToken: tokens.refresh_token || registration.refreshToken,
        idToken: tokens.id_token || registration.idToken,
        scopes: tokens.scopes.length ? tokens.scopes : registration.scopes,
      });
      await api().storage.session.set({ [ACCESS]: { token: tokens.access_token, expiresAt: tokens.expiresAt } });
      return tokens.access_token as string;
    } catch (error: any) {
      if (error.kind === 'reconnect') await signedOut('Din ChatGPT-adgang er udløbet. Log ind igen.');
      throw error;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** For the app's chat: { ok, token } or { ok: false, kind, message }. */
export async function tokenForApp(force: boolean) {
  try {
    if (!(await loadAccount()).connected) return { ok: false, kind: 'reconnect', message: 'Log ind med ChatGPT.' };
    return { ok: true, token: await accessToken({ force }) };
  } catch (error: any) {
    return { ok: false, kind: error?.kind || 'retry', message: error?.message || 'ChatGPT-login fejlede.' };
  }
}

/** Tokens are unusable: keep the registration (client id, identity) for the next sign-in, drop the credentials. */
export async function signedOut(message: string) {
  const registration = await loadRegistration();
  await saveRegistration({ clientId: registration.clientId, subject: registration.subject, email: registration.email });
  await api().storage.session.remove(ACCESS);
  await saveAccount({ connected: false, planEnabled: false, reconnect: !!message, message: message || '' });
  return { ok: true };
}

export async function signOut() {
  const registration = await loadRegistration();
  let revoked = !registration.refreshToken;
  for (let attempt = 0; !revoked && attempt < 3; attempt++) {
    try {
      await revokeToken({ clientId: registration.clientId, refreshToken: registration.refreshToken });
      revoked = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
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
  } catch (error: any) {
    return { ok: false, message: error.message };
  }
}
