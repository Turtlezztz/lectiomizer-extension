// Background side of AI authentication (ChatGPT OAuth + OpenRouter OAuth PKCE /
// API key): starts sign-in, catches loopback callbacks, keeps credentials in
// extension storage and hands tokens/keys to the app's chat.
//
// An extension can't listen on 127.0.0.1, so OAuth opens the provider in a tab
// and catches the tab's navigation to the loopback callback (the `tabs`
// permission lets us see it), or, as a last resort, an address the student
// pastes in.
import {
  OPENROUTER_DEFAULTS,
  hasChatPermissions,
  hasOpenRouterPermissions,
  isChatGPTReady,
  loadAccount,
  saveAccount,
  saveOpenRouter,
} from './account';
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
import {
  OpenRouterError,
  checkOpenRouterKey,
  exchangeOpenRouterCode,
  listOpenRouterModels,
  openRouterAuthorizeUrl,
  openRouterCallbackUri,
  readOpenRouterCallback,
} from './openrouter.js';

const api = () => (globalThis as any).browser ?? (globalThis as any).chrome;

// ChatGPT registration (issued client id, identity, refresh and id token) persists
// so the student stays signed in; the hour-long access token stays in session storage.
const REGISTRATION = 'chatgptRegistration';
const HOST = 'chatgptHost';
const ACCESS = 'chatgptAccess';
// Sign-in attempts by their OAuth state, so a second click doesn't void the first tab.
const PENDING = 'chatgptAttempts';
// OpenRouter API key stays in local storage (never inside chatAccount).
const OPENROUTER_KEY = 'openrouterKey';
const OPENROUTER_PENDING = 'openrouterAttempts';
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
interface OpenRouterAttempt {
  verifier: string;
  redirectUri: string;
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

async function loadOpenRouterAttempts(): Promise<Record<string, OpenRouterAttempt>> {
  const { [OPENROUTER_PENDING]: attempts = {} } = await api().storage.session.get(OPENROUTER_PENDING);
  const now = Date.now();
  return Object.fromEntries(Object.entries(attempts as Record<string, OpenRouterAttempt>).filter(([, a]) => now - a.startedAt < ATTEMPT_TTL));
}
const saveOpenRouterAttempts = (attempts: Record<string, OpenRouterAttempt>) => api().storage.session.set({ [OPENROUTER_PENDING]: attempts });

// ------------------------------------------------------------------ ChatGPT

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
    await saveAccount({
      ...(planEnabled ? { provider: 'chatgpt' as const } : {}),
      connected: true,
      email: claims.email || '',
      planEnabled,
      models,
      modelsAt: models.length ? Date.now() : 0,
      reconnect: false,
      pending: false,
      message: '',
    });
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

/** The pending ChatGPT attempt a callback address belongs to. Claiming removes it, so each code is used once. */
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

/** The student pasted the address of a ChatGPT callback page that wouldn't load. */
export async function pasteCallback(href: unknown) {
  const value = String(href || '').trim();
  const attempt = await claim(value);
  if (!attempt) return { ok: false, message: 'Adressen passer ikke til et login, der er i gang. Start forfra med Fortsæt med ChatGPT.' };
  return complete(value, attempt, attempt.tabId);
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
  const current = await loadAccount();
  await saveAccount({
    ...(current.openrouter.connected ? { provider: 'openrouter' as const } : {}),
    email: '',
    models: [],
    modelsAt: 0,
    message: revoked ? '' : 'Du er logget ud her, men ChatGPT bekræftede ikke afmeldingen. Du kan fjerne Lectiomizer under Indstillinger i ChatGPT.',
  });
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

// --------------------------------------------------------------- OpenRouter

async function connectOpenRouterWithKey(rawKey: string) {
  const key = rawKey.trim();
  const info = await checkOpenRouterKey({ key });
  const models = await listOpenRouterModels({ key }).catch(() => [{ slug: 'openrouter/auto', name: 'OpenRouter Auto' }]);
  await api().storage.local.set({ [OPENROUTER_KEY]: key });
  const current = await loadAccount();
  const model = current.openrouter.model || models[0]?.slug || 'openrouter/auto';
  await saveOpenRouter(
    {
      connected: true,
      label: info.label,
      models,
      modelsAt: Date.now(),
      model,
      pending: false,
      message: '',
    },
    { provider: 'openrouter' },
  );
  return { ok: true };
}

/** Opens OpenRouter's OAuth PKCE sign-in in a new tab. */
export async function startOpenRouterSignIn({ openerTabId = null }: { openerTabId?: number | null } = {}) {
  if (!(await hasOpenRouterPermissions())) return { ok: false, message: 'Giv Lectiomizer lov til at kontakte OpenRouter først.' };
  const verifier = randomToken(48);
  const attempt: OpenRouterAttempt = {
    verifier,
    redirectUri: openRouterCallbackUri(49152 + Math.floor(Math.random() * 16000)),
    startedAt: Date.now(),
    openerTabId,
    tabId: null,
  };
  const url = openRouterAuthorizeUrl({ redirectUri: attempt.redirectUri, challenge: await pkceChallenge(verifier) });
  await saveOpenRouterAttempts({ ...(await loadOpenRouterAttempts()), [attempt.redirectUri]: attempt });
  await saveOpenRouter({ pending: true, message: '' });
  const tab = await api().tabs.create({ url, ...(openerTabId != null ? { openerTabId } : {}) });
  const attempts = await loadOpenRouterAttempts();
  if (attempts[attempt.redirectUri]) {
    await saveOpenRouterAttempts({ ...attempts, [attempt.redirectUri]: { ...attempts[attempt.redirectUri], tabId: tab.id } });
  }
  return { ok: true, started: true };
}

export async function cancelOpenRouterSignIn() {
  const attempts = await loadOpenRouterAttempts();
  await api().storage.session.remove(OPENROUTER_PENDING);
  await saveOpenRouter({ pending: false });
  for (const attempt of Object.values(attempts)) if (attempt.tabId != null) api().tabs.remove(attempt.tabId).catch(() => {});
  return { ok: true };
}

async function finishOpenRouterSignIn(url: string, attempt: OpenRouterAttempt) {
  try {
    const { code } = readOpenRouterCallback(url);
    const { key } = await exchangeOpenRouterCode({ code, verifier: attempt.verifier });
    const result = await connectOpenRouterWithKey(key);
    await api().storage.session.remove(OPENROUTER_PENDING);
    return result;
  } catch (error: any) {
    const message = error instanceof OpenRouterError || error instanceof ChatGPTError ? error.message : 'OpenRouter-login fejlede. Prøv igen.';
    await saveOpenRouter({ pending: false, message });
    if (!(error instanceof ChatGPTError)) console.error('Lectiomizer:', error);
    return { ok: false, message };
  }
}

async function claimOpenRouter(href: string): Promise<OpenRouterAttempt | null> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/openrouter/callback') return null;
  const key = `${url.origin}${url.pathname}`;
  const attempts = await loadOpenRouterAttempts();
  const attempt = attempts[key];
  if (!attempt) return null;
  delete attempts[key];
  await saveOpenRouterAttempts(attempts);
  return attempt;
}

function completeOpenRouter(href: string, attempt: OpenRouterAttempt, tabId: number | null) {
  if (tabId != null && tabId >= 0) api().tabs.remove(tabId).catch(() => {});
  if (attempt.openerTabId != null) api().tabs.update(attempt.openerTabId, { active: true }).catch(() => {});
  return finishOpenRouterSignIn(href, attempt);
}

/** The student pasted the address of an OpenRouter callback page that wouldn't load. */
export async function pasteOpenRouterCallback(href: unknown) {
  const value = String(href || '').trim();
  const attempt = await claimOpenRouter(value);
  if (!attempt) return { ok: false, message: 'Adressen passer ikke til et OpenRouter-login, der er i gang. Start forfra.' };
  return completeOpenRouter(value, attempt, attempt.tabId);
}

/** Validates and stores a manually pasted OpenRouter API key. */
export async function setOpenRouterKey(rawKey: unknown) {
  if (!(await hasOpenRouterPermissions())) return { ok: false, message: 'Giv Lectiomizer lov til at kontakte OpenRouter først.' };
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, message: 'Indsæt en OpenRouter API-nøgle.' };
  try {
    return await connectOpenRouterWithKey(key);
  } catch (error: any) {
    const message = error instanceof ChatGPTError ? error.message : 'Kunne ikke kontakte OpenRouter. Tjek nøglen og prøv igen.';
    await saveOpenRouter({ pending: false, message });
    return { ok: false, message };
  }
}

export async function disconnectOpenRouter() {
  await api().storage.local.remove(OPENROUTER_KEY);
  await api().storage.session.remove(OPENROUTER_PENDING);
  const current = await loadAccount();
  await saveOpenRouter(
    { ...OPENROUTER_DEFAULTS },
    isChatGPTReady(current) ? { provider: 'chatgpt' } : undefined,
  );
  return { ok: true };
}

export async function openRouterSignedOut(message: string) {
  await api().storage.local.remove(OPENROUTER_KEY);
  await saveOpenRouter({ connected: false, pending: false, message: message || 'Forbind OpenRouter igen.' });
  return { ok: true };
}

export async function openRouterTokenForApp() {
  const account = await loadAccount();
  if (!account.openrouter.connected) return { ok: false, kind: 'reconnect', message: 'Forbind OpenRouter.' };
  const { [OPENROUTER_KEY]: key } = await api().storage.local.get(OPENROUTER_KEY);
  if (!key) return { ok: false, kind: 'reconnect', message: 'Din OpenRouter-nøgle mangler. Forbind OpenRouter igen.' };
  return { ok: true, token: String(key) };
}

export async function refreshOpenRouterModels() {
  try {
    const { [OPENROUTER_KEY]: key } = await api().storage.local.get(OPENROUTER_KEY);
    const models = await listOpenRouterModels({ key: key ? String(key) : '' });
    await saveOpenRouter({ models, modelsAt: Date.now() });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error.message };
  }
}

// ------------------------------------------------------------------ tab hooks

/** tabs.onUpdated: a sign-in tab went to a loopback callback (nothing listens there). */
export async function onTabUpdated(tabId: number, changeInfo: { url?: string }) {
  if (!changeInfo?.url || !changeInfo.url.startsWith('http://127.0.0.1')) return;
  const attempt = await claim(changeInfo.url);
  if (attempt) {
    await complete(changeInfo.url, attempt, tabId);
    return;
  }
  const orAttempt = await claimOpenRouter(changeInfo.url);
  if (orAttempt) await completeOpenRouter(changeInfo.url, orAttempt, tabId);
}

/** The student closed a sign-in tab before finishing. */
export async function onTabRemoved(tabId: number) {
  const attempts = await loadAttempts();
  const left = Object.fromEntries(Object.entries(attempts).filter(([, a]) => a.tabId !== tabId));
  if (Object.keys(left).length !== Object.keys(attempts).length) {
    await saveAttempts(left);
    if (!Object.keys(left).length) await saveAccount({ pending: false });
  }
  const orAttempts = await loadOpenRouterAttempts();
  const orLeft = Object.fromEntries(Object.entries(orAttempts).filter(([, a]) => a.tabId !== tabId));
  if (Object.keys(orLeft).length !== Object.keys(orAttempts).length) {
    await saveOpenRouterAttempts(orLeft);
    if (!Object.keys(orLeft).length) await saveOpenRouter({ pending: false });
  }
}
