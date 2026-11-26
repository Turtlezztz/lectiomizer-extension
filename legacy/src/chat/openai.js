// Sign in with ChatGPT for open-source apps, and the Responses API it pays
// for. Follows https://developers.openai.com/siwc/token-sharing-open-source:
// the first sign-in registers Lectiomizer as the user's own agent
// (client_id=dynamic_agent_client) and returns an issued client id that later
// sign-ins reuse. No client secret or API key is involved.
// Everything here is plain functions with an injectable fetch, so it runs in
// the background script and in tests.

export const ISSUER = 'https://auth.openai.com';
export const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
export const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
export const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
export const API = 'https://api.openai.com/v1';
export const RESOURCE = API;
export const DYNAMIC_CLIENT = 'dynamic_agent_client';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
export const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', PLAN_SCOPE];

export class ChatGPTError extends Error {
  // kind: 'reconnect' (sign in again), 'limit' (usage limit), 'retry'
  // (temporary), 'unsupported' (bad request content) or 'other'.
  constructor(message, { kind = 'other', status = 0, code = '', param = '', detail = '', requestId = '' } = {}) {
    super(message);
    this.name = 'ChatGPTError';
    Object.assign(this, { kind, status, code, param, detail, requestId });
  }
}

const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64url = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), c => c.charCodeAt(0));

export const randomToken = (size = 32) => base64url(crypto.getRandomValues(new Uint8Array(size)));

// The stable, opaque id of this Firefox profile as an agent host.
export const newHostId = () => `urn:uuid:${crypto.randomUUID()}`;

export async function pkceChallenge(verifier) {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

// A loopback callback the background script intercepts before it reaches the
// network; only the port varies between attempts.
export function callbackUri(port) {
  return `http://127.0.0.1:${port}/auth/callback`;
}

// `clientId` is the issued id of a returning registration, or empty to register.
export function authorizeUrl({ clientId, hostId, redirectUri, state, nonce, challenge, idTokenHint = '', loginHint = '' }) {
  const params = {
    client_id: clientId || DYNAMIC_CLIENT,
    ...(clientId ? {} : { agent_name_hint: 'Lectiomizer' }),
    ext_agent_host_id: hostId,
    ...(clientId && idTokenHint ? { id_token_hint: idTokenHint } : {}),
    ...(clientId && loginHint ? { login_hint: loginHint } : {}),
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  };
  return `${AUTHORIZE_URL}?${new URLSearchParams(params)}`;
}

// Checks a callback against the pending attempt; returns the code and the
// client id to exchange it with.
export function readCallback(url, pending) {
  const params = new URL(url).searchParams;
  if (params.get('state') !== pending.state) throw new ChatGPTError('Login-svaret passede ikke til dette forsøg. Prøv igen.');
  const error = params.get('error');
  if (error === 'access_denied') throw new ChatGPTError('Du afviste adgangen i ChatGPT.', { code: error });
  if (error) throw new ChatGPTError(params.get('error_description') || 'ChatGPT-login fejlede.', { code: error });
  const code = params.get('code');
  if (!code) throw new ChatGPTError('ChatGPT sendte ingen login-kode.');
  const issued = params.get('client_id');
  if (pending.clientId) {
    if (issued && issued !== pending.clientId) throw new ChatGPTError('ChatGPT svarede for en anden registrering. Prøv igen.');
    return { code, clientId: pending.clientId };
  }
  if (!issued || issued === DYNAMIC_CLIENT) throw new ChatGPTError('Registreringen i ChatGPT blev ikke gennemført. Prøv igen.');
  return { code, clientId: issued };
}

async function tokenRequest(fetch, form) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body.error || '';
    const unusable = /invalid_grant|invalid_refresh_token|token_expired|refresh_token_(expired|invalidated|reused)|invalid_client/.test(code);
    throw new ChatGPTError(unusable ? 'Log ind med ChatGPT igen.' : body.error_description || `ChatGPT-login svarede ${response.status}.`, { kind: unusable ? 'reconnect' : 'retry', status: response.status, code });
  }
  return { ...body, scopes: (body.scope || '').split(' ').filter(Boolean), expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
}

export function exchangeCode({ fetch = globalThis.fetch, clientId, code, verifier, redirectUri }) {
  return tokenRequest(fetch, { grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE });
}

// Refresh tokens rotate: the caller must store the replacement.
export function refreshTokens({ fetch = globalThis.fetch, clientId, refreshToken }) {
  return tokenRequest(fetch, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, resource: RESOURCE });
}

export async function revokeToken({ fetch = globalThis.fetch, clientId, refreshToken }) {
  const { revocation_endpoint: endpoint } = await fetch(DISCOVERY_URL, { credentials: 'omit' }).then(r => r.json());
  const response = await fetch(endpoint, {
    method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId }),
  });
  if (!response.ok) throw new ChatGPTError(`Tilbagekaldelsen svarede ${response.status}.`, { status: response.status });
}

export function decodeJwt(token) {
  const [header, payload] = token.split('.');
  const json = part => JSON.parse(new TextDecoder().decode(fromBase64url(part)));
  return { header: json(header), payload: json(payload) };
}

export async function fetchJwks(fetch = globalThis.fetch) {
  const { jwks_uri: uri } = await fetch(DISCOVERY_URL, { credentials: 'omit' }).then(r => r.json());
  return (await fetch(uri, { credentials: 'omit' }).then(r => r.json())).keys || [];
}

// Verifies the ID token's signature against OpenAI's keys and checks issuer,
// audience, expiry and nonce. Returns the claims.
export async function verifyIdToken(idToken, { clientId, nonce, keys, now = Date.now() }) {
  const invalid = why => new ChatGPTError(`ChatGPT-login kunne ikke bekræftes (${why}).`);
  let header, payload;
  try { ({ header, payload } = decodeJwt(idToken)); } catch { throw invalid('ugyldigt id-token'); }
  if (header.alg !== 'RS256') throw invalid('ukendt signatur');
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw invalid('ukendt nøgle');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const [h, p, signature] = idToken.split('.');
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(signature), new TextEncoder().encode(`${h}.${p}`))) throw invalid('signatur');
  const audience = [].concat(payload.aud);
  const skew = 120;
  if (payload.iss !== ISSUER) throw invalid('udsteder');
  if (!audience.includes(clientId)) throw invalid('modtager');
  if (!(payload.exp > now / 1000 - skew)) throw invalid('udløbet');
  if (payload.nonce !== nonce) throw invalid('nonce');
  return payload;
}

// The models the signed-in plan offers, in the server's order.
export async function listModels({ fetch = globalThis.fetch, token }) {
  const response = await fetch(`${API}/models`, { credentials: 'omit', headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw await responseError(response);
  const body = await response.json();
  if (!body.models && Array.isArray(body.data)) return body.data.filter(m => m.id).map(m => ({ slug: m.id, name: m.id }));
  return (body.models || []).filter(m => m.visibility === 'list' && m.slug).map(m => ({ slug: m.slug, name: m.display_name || m.slug }));
}

const codes = {
  subscription_sharing_user_not_eligible: ['other', 'Din ChatGPT-plan kan ikke bruges i Lectiomizer.'],
  subscription_sharing_usage_limit_exceeded: ['limit', 'Grænsen for brug af din ChatGPT-plan er nået.'],
  subscription_sharing_usage_unavailable: ['retry', 'ChatGPT kunne ikke tjekke dit forbrug lige nu. Prøv igen om lidt.'],
  subscription_sharing_user_unavailable: ['retry', 'ChatGPT er ikke tilgængelig lige nu. Prøv igen om lidt.'],
  subscription_sharing_invalid_user: ['reconnect', 'Log ind med ChatGPT igen.'],
  subscription_sharing_unsupported_capability: ['unsupported', 'ChatGPT kunne ikke bruge en del af forespørgslen.'],
  server_is_overloaded: ['retry', 'ChatGPT har travlt lige nu. Prøv igen om lidt, eller vælg en anden model.'],
  server_error: ['retry', 'ChatGPT havde en fejl. Prøv igen om lidt.'],
  rate_limit_exceeded: ['retry', 'For mange forespørgsler lige nu. Vent lidt, og prøv igen.'],
};

// The error object in whatever shape it arrives: an HTTP body ({ error } or
// { detail }), a stream "error" event (fields at the top, or under `error`) or
// response.failed ({ response: { error } }).
function findError(body) {
  for (const candidate of [body?.error?.error, body?.error, body?.response?.error, body]) {
    if (candidate && typeof candidate === 'object' && (candidate.message || candidate.code)) return candidate;
  }
  return typeof body?.error === 'string' ? { message: body.error } : {};
}

// Maps a Responses error, or a failed HTTP response, to a ChatGPTError. The
// server's own message is kept as `detail` for diagnosis.
export function errorFromBody(status, body = {}) {
  const error = findError(body);
  const code = error.code || (error.type && error.type !== 'error' ? error.type : '') || '';
  const raw = body?.detail;
  const detail = String(error.message || (typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : '') || body?.response?.incomplete_details?.reason || '').slice(0, 300);
  const param = error.param || '';
  let [kind, message] = codes[code] || (status === 401 ? ['reconnect', 'Log ind med ChatGPT igen.']
    : status === 429 ? ['limit', 'Grænsen for brug af din ChatGPT-plan er nået.']
    : status === 503 || status >= 500 ? ['retry', 'ChatGPT er ikke tilgængelig lige nu. Prøv igen om lidt.']
    : ['other', detail ? `ChatGPT svarede: ${detail}` : `ChatGPT svarede ${status || 'med en fejl'} uden forklaring.`]);
  if (kind === 'unsupported' && (param || detail)) message += ` (${[param, detail].filter(Boolean).join(': ')})`;
  return new ChatGPTError(message, { kind, status, code, param, detail });
}

export async function responseError(response) {
  const text = await response.text().catch(() => '');
  let body = {};
  try { body = JSON.parse(text); } catch { body = { detail: text.slice(0, 200) }; }
  const error = errorFromBody(response.status, body);
  error.requestId = response.headers?.get?.('x-request-id') || '';
  return error;
}

// Server-sent events from a fetch body → parsed JSON events. Stopping
// cancels the read instead of waiting for the next chunk.
export async function* readEvents(body, signal) {
  const reader = body.getReader();
  const cancel = () => reader.cancel().catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  const parse = block => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return null;
    try { return JSON.parse(data); } catch { return null; }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = done ? '' : blocks.pop();
      for (const block of blocks) {
        const event = parse(block);
        if (event) yield event;
      }
      if (done) return;
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

// Unsupported on this route; also stripped from replayed output items.
const UNSUPPORTED = ['background', 'conversation', 'max_output_tokens', 'max_tool_calls', 'metadata', 'moderation', 'prompt', 'previous_response_id', 'temperature', 'top_p', 'truncation', 'user'];

// Builds a Responses request body that follows the plan-usage requirements.
export function requestBody({ model, instructions, input, tools, effort }) {
  const body = { model, instructions, input, tools, store: false, stream: true, ...(effort ? { reasoning: { effort } } : {}) };
  for (const key of UNSUPPORTED) delete body[key];
  return body;
}
