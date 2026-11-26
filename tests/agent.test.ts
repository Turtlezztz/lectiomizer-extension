// The assistant: a chat turn with tool calls, Responses streaming with
// retries, and Sign in with ChatGPT – against a fake browser and a fake OpenAI.
// Ported from v1's chat.test.mjs and chat-session.test.mjs.
import { describe, expect, it } from 'vitest';

const local: Record<string, any> = {};
const session: Record<string, any> = {};
const tabs = { created: [] as string[], removed: [] as number[], updated: [] as any[] };
const area = (store: Record<string, any>) => ({
  get: async (key: string | string[]) => Object.fromEntries(([] as string[]).concat(key).map((k) => [k, store[k]])),
  set: async (values: Record<string, any>) => void Object.assign(store, structuredClone(values)),
  remove: async (key: string | string[]) => {
    for (const k of ([] as string[]).concat(key)) delete store[k];
  },
});
(globalThis as any).browser = {
  runtime: { id: 'test' },
  storage: { local: area(local), session: area(session), onChanged: { addListener() {}, removeListener() {} } },
  permissions: { contains: async () => true },
  tabs: {
    create: async ({ url }: { url: string }) => (tabs.created.push(url), { id: 7 }),
    remove: async (id: number) => void tabs.removed.push(id),
    update: async (id: number, patch: any) => void tabs.updated.push([id, patch]),
  },
};

const { startSignIn, onTabUpdated, pasteCallback, signOut, tokenForApp } = await import('@/lib/agent/session');
const { responses, retry, runTurn, savedParts, inputFromTurns, withoutFiles, toolOutput, RESPONSES_TOOLS, instructions } = await import('@/lib/agent/agent');
const { ChatGPTError } = await import('@/lib/agent/openai.js');
retry.delays = [0, 0, 0];

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
async function idToken(claims: Record<string, unknown>) {
  const head = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(head));
  return `${head}.${Buffer.from(sig).toString('base64url')}`;
}

const requests: Array<[string, any]> = [];
let responsesStatus: Array<number | string> = [200];
const sse = (events: any[]) =>
  new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
globalThis.fetch = (async (url: string, init: any = {}) => {
  requests.push([url, init]);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (url === 'https://auth.openai.com/.well-known/openid-configuration') return json({ jwks_uri: 'https://auth.openai.com/jwks', revocation_endpoint: 'https://auth.openai.com/revoke' });
  if (url === 'https://auth.openai.com/jwks') return json({ keys: [jwk] });
  if (url === 'https://auth.openai.com/revoke') return new Response('', { status: 200 });
  if (url === 'https://auth.openai.com/api/accounts/oauth/token') {
    const form = Object.fromEntries(init.body);
    if (form.grant_type === 'refresh_token') return json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, scope: 'openid email offline_access resource.invoke chatgpt.tokens.use.direct' });
    return json({
      access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      id_token: await idToken({ iss: 'https://auth.openai.com', aud: form.client_id, sub: 'user-1', email: 'elev@example.com', nonce: local.lastNonce, exp: Math.floor(Date.now() / 1000) + 600 }),
    });
  }
  if (url === 'https://api.openai.com/v1/models') return json({ models: [{ slug: 'gpt-a', display_name: 'GPT A', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }] });
  if (url === 'https://api.openai.com/v1/responses') {
    const status = responsesStatus.shift() ?? 200;
    const overloaded = { type: 'error', code: 'server_is_overloaded', message: 'Overloaded', param: null };
    const stream = (events: any[], headers = {}) => new Response(sse(events), { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } });
    if (status === 'overloaded') return stream([{ type: 'response.created', response: {} }, overloaded]);
    if (status === 'overloaded-late') return stream([{ type: 'response.output_item.added', item: { type: 'message', id: 'm' } }, { type: 'response.output_text.delta', item_id: 'm', delta: 'Hal' }, overloaded]);
    if (status === 'fail') return stream([{ type: 'error', error: { type: 'invalid_request_error', code: 'model_not_found', message: 'The model gpt-a does not exist.' } }], { 'x-request-id': 'req_123' });
    if (status !== 200) return json({ detail: 'expired' }, status as number);
    return stream([{ type: 'response.output_item.added', item: { type: 'message', id: 'm' } }, { type: 'response.output_text.delta', item_id: 'm', delta: 'Hej' }, { type: 'response.completed', response: { usage: {} } }]);
  }
  return new Response('not found', { status: 404 });
}) as any;

const until = async (check: () => unknown) => {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('timed out');
};
const latest = () => session.chatgptAttempts?.[new URL(tabs.created.at(-1)!).searchParams.get('state')!];
const getToken = (force: boolean) => tokenForApp(force);
async function collect(request: any) {
  const types: string[] = [];
  try {
    for await (const event of responses({ instructions: 'i', tools: [], input: [], ...request }, undefined, getToken)) types.push(event.type);
    return { types, error: undefined as any };
  } catch (error) {
    return { types, error: error as any };
  }
}

describe('Sign in with ChatGPT', () => {
  it('catches the callback from the tab address, verifies the identity and saves the plan', async () => {
    await startSignIn({ openerTabId: 3 });
    const auth = new URL(tabs.created[0]);
    expect(auth.searchParams.get('client_id')).toBe('dynamic_agent_client');
    const pending = latest();
    expect(pending.tabId).toBe(7);
    expect(local.chatAccount.pending).toBe(true);
    // Other loopback pages are left alone.
    await onTabUpdated(9, { url: 'http://127.0.0.1:3000/' });
    await onTabUpdated(9, { url: `http://127.0.0.1:1/auth/callback?code=x&state=${pending.state}` });
    expect(tabs.removed).toEqual([]);
    local.lastNonce = pending.nonce;
    await onTabUpdated(7, { url: `${pending.redirectUri}?code=k&state=${pending.state}&client_id=oaiapp_1` });
    expect(tabs.removed).toEqual([7]);
    expect(tabs.updated).toEqual([[3, { active: true }]]);
    await until(() => local.chatAccount?.connected);
    expect(local.chatAccount.models).toEqual([{ slug: 'gpt-a', name: 'GPT A' }]);
    expect(local.chatAccount.planEnabled).toBe(true);
    expect(local.chatgptRegistration.clientId).toBe('oaiapp_1');
    expect(session.chatgptAccess.token).toBe('access-1');
    // The second sign-in reuses the issued client; a pasted address also works.
    await startSignIn({});
    const again = latest();
    expect(new URL(tabs.created[1]).searchParams.get('client_id')).toBe('oaiapp_1');
    expect((await pasteCallback('noget andet')).message).toMatch(/passer ikke/);
    local.lastNonce = again.nonce;
    expect(await pasteCallback(` ${again.redirectUri}?code=k2&state=${again.state} `)).toEqual({ ok: true });
  });

  it('streams with the token from the background, renewing it once on 401', async () => {
    responsesStatus = [401, 200];
    const before = requests.length;
    const { types, error } = await collect({ model: 'gpt-a', input: [{ role: 'user', content: 'Hej' }], effort: '' });
    expect(error).toBeUndefined();
    expect(types).toEqual(['response.output_item.added', 'response.output_text.delta', 'response.completed']);
    const calls = requests.slice(before).filter(([url]) => url === 'https://api.openai.com/v1/responses');
    expect(calls.map(([, init]) => init.headers.Authorization)).toEqual(['Bearer access-1', 'Bearer access-2']);
    const body = JSON.parse(calls[1][1].body);
    expect([body.store, body.stream, body.reasoning]).toEqual([false, true, undefined]);
    expect(local.chatgptRegistration.refreshToken).toBe('refresh-2');
  });

  it('keeps the server error and request id, and retries busy servers only before anything is shown', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      responsesStatus = ['fail'];
      const failed = await collect({ model: 'gpt-a' });
      expect(failed.error.message).toBe('ChatGPT svarede: The model gpt-a does not exist.');
      expect([failed.error.code, failed.error.requestId]).toEqual(['model_not_found', 'req_123']);
      responsesStatus = ['overloaded', 'overloaded', 200];
      expect((await collect({ model: 'gpt-a' })).types.slice(0, 2)).toEqual(['lx.retrying', 'lx.retrying']);
      responsesStatus = ['overloaded-late', 200];
      const late = await collect({ model: 'gpt-a' });
      expect(late.types).toEqual(['response.output_item.added', 'response.output_text.delta']);
      expect(late.error.kind).toBe('retry');
    } finally {
      console.warn = warn;
      responsesStatus = [200];
    }
  });

  it('signing out revokes the refresh token and keeps the client registration', async () => {
    await signOut();
    const revoke = requests.find(([url]) => url === 'https://auth.openai.com/revoke')!;
    expect(Object.fromEntries(revoke[1].body)).toMatchObject({ token: 'refresh-2', client_id: 'oaiapp_1' });
    expect(Object.keys(local.chatgptRegistration).sort()).toEqual(['clientId', 'email', 'subject']);
    expect(local.chatAccount.connected).toBe(false);
    expect((await collect({ model: 'gpt-a' })).error.kind).toBe('reconnect');
  });
});

// A scripted model: each round is a list of events, or an error to throw.
function script(rounds: any[]) {
  const seen: any[][] = [];
  async function* stream(input: any[]) {
    seen.push(structuredClone(input));
    const round = rounds.shift();
    if (round instanceof Error) throw round;
    for (const event of round) yield event;
  }
  return { stream, seen };
}
const message = (id: string, text: string, phase = 'final_answer') => [
  { type: 'response.output_item.added', item: { type: 'message', id, phase } },
  ...text.match(/.{1,5}/g)!.map((delta) => ({ type: 'response.output_text.delta', item_id: id, delta })),
  { type: 'response.output_item.done', item: { type: 'message', id, role: 'assistant', phase, created_by: 'x', content: [{ type: 'output_text', text }] } },
];
const fnCall = (id: string, name: string, args: unknown) => [
  { type: 'response.output_item.added', item: { type: 'function_call', id, name, namespace: 'lectio' } },
  { type: 'response.output_item.done', item: { type: 'function_call', id, call_id: 'c' + id, name, namespace: 'lectio', arguments: JSON.stringify(args) } },
];

describe('a chat turn', () => {
  it('runs tool calls side by side and feeds the results back until the model answers', async () => {
    const { stream, seen } = script([[...fnCall('1', 'list_assignments', { status: 'open', search: null }), ...fnCall('2', 'get_schedule', { start: null, days: 1 })], message('m1', 'Du har to opgaver.')]);
    const calls: any[] = [];
    const runTool = async (name: string, args: any) => (calls.push([name, args]), { ok: true, text: `# ${name}`, label: `Læste ${name}`, href: null });
    const updates: string[] = [];
    const input: any[] = [{ role: 'user', content: 'Hvad skal jeg?' }];
    const parts = await runTurn({ input, stream, runTool, onUpdate: (_p, s) => updates.push(s) });
    expect(calls).toEqual([['list_assignments', { status: 'open', search: null }], ['get_schedule', { start: null, days: 1 }]]);
    expect(parts.map((p: any) => [p.type, p.label || p.text])).toEqual([['tool', 'Læste list_assignments'], ['tool', 'Læste get_schedule'], ['text', 'Du har to opgaver.']]);
    expect(input.map((i) => i.type || i.role)).toEqual(['user', 'function_call', 'function_call', 'function_call_output', 'function_call_output', 'message']);
    expect(seen[1].length).toBe(5);
    expect(updates).toContain('Læser opgaverne…');
    expect(savedParts(parts)[0]).toEqual({ type: 'tool', name: 'list_assignments', label: 'Læste list_assignments', href: null, status: 'done' });
  });

  it('drops a file ChatGPT rejects once, and stopping keeps what was shown', async () => {
    const input: any[] = [
      { role: 'user', content: 'Læs' },
      { type: 'function_call', call_id: 'c1', name: 'read_document', arguments: '{}' },
      { type: 'function_call_output', call_id: 'c1', output: toolOutput({ ok: true, text: 'Dokument: a.pdf', label: '', files: [{ kind: 'file', name: 'a.pdf', mime: 'application/pdf', data: 'AA==' }] }) },
    ];
    expect(input[2].output[1]).toEqual({ type: 'input_file', filename: 'a.pdf', file_data: 'data:application/pdf;base64,AA==' });
    const { stream } = script([new ChatGPTError('nej', { kind: 'unsupported', status: 400 }), message('m1', 'Filen kunne ikke læses.')]);
    const parts = await runTurn({ input, stream, runTool: async () => ({ ok: true, text: '', label: '' }) });
    expect((parts.at(-1) as any).text).toBe('Filen kunne ikke læses.');
    expect(input[2].output).toMatch(/Dokument: a\.pdf\n\(Filens indhold kunne ikke sendes til ChatGPT\.\)/);
    expect(withoutFiles(input)).toBe(false);

    const controller = new AbortController();
    const halted: any[] = [];
    const stopping = async function* () {
      yield { type: 'response.output_item.added', item: { type: 'message', id: 'm', phase: 'final_answer' } };
      yield { type: 'response.output_text.delta', item_id: 'm', delta: 'Halvt svar' };
      controller.abort();
      throw new DOMException('Stoppet', 'AbortError');
    };
    await expect(runTurn({ input: halted, stream: stopping, runTool: async () => ({ ok: true, text: '', label: '' }), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(halted).toEqual([{ role: 'assistant', content: 'Halvt svar' }]);
  });

  it('rebuilds a text-only history and describes the tools in a namespace', () => {
    const turns: any[] = [{ role: 'user', text: 'Hej' }, { role: 'assistant', parts: [{ type: 'tool', label: 'x' }, { type: 'text', text: 'Svar', phase: 'final_answer' }] }];
    expect(inputFromTurns(turns)).toEqual([{ role: 'user', content: 'Hej' }, { role: 'assistant', content: 'Svar', phase: 'final_answer' }]);
    expect(RESPONSES_TOOLS[0].name).toBe('lectio');
    expect(RESPONSES_TOOLS[0].tools.every((t: any) => t.strict && t.parameters.additionalProperties === false)).toBe(true);
    expect(instructions({ name: 'Demo Elev', school: 'Demo Gymnasium' })).toMatch(/Demo Elev[\s\S]*list_assignments/);
  });
});
