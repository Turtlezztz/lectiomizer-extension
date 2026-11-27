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

const {
  startSignIn,
  onTabUpdated,
  pasteCallback,
  signOut,
  tokenForApp,
  startOpenRouterSignIn,
  pasteOpenRouterCallback,
  setOpenRouterKey,
  disconnectOpenRouter,
  openRouterTokenForApp,
} = await import('@/lib/agent/session');
const {
  responses,
  openrouterResponses,
  retry,
  runTurn,
  savedParts,
  inputFromTurns,
  withoutFiles,
  toolOutput,
  RESPONSES_TOOLS,
  OPENROUTER_TOOLS,
  instructions,
} = await import('@/lib/agent/agent');
const { ChatGPTError } = await import('@/lib/agent/openai.js');
const { openRouterMessages } = await import('@/lib/agent/openrouter.js');
const { activeProvider, mergeAccount, modelOf } = await import('@/lib/agent/account');
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
let openrouterStatus: Array<number | string> = [200];
const sse = (events: any[]) =>
  new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
const orSse = (chunks: any[]) =>
  new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(': OPENROUTER PROCESSING\n\n'));
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(`data: ${typeof chunk === 'string' ? chunk : JSON.stringify(chunk)}\n\n`));
      c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
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
  if (url === 'https://openrouter.ai/api/v1/auth/keys') {
    const body = JSON.parse(init.body || '{}');
    if (body.code === 'or_code_1' && body.code_verifier) return json({ key: 'sk-or-v1-oauthkey123456', user_id: 'u_1' });
    if (body.code === 'or_code_2' && body.code_verifier) return json({ key: 'sk-or-v1-oauthkey654321', user_id: 'u_1' });
    return json({ error: { message: 'Invalid code', code: 400 } }, 400);
  }
  if (url === 'https://openrouter.ai/api/v1/key') {
    if (init.headers?.Authorization === 'Bearer sk-or-v1-bad') return json({ error: { message: 'Invalid credentials', code: 401 } }, 401);
    return json({ data: { label: 'sk-or-v1-min-nøgle', limit: 10, limit_remaining: 8.5, is_free_tier: false } });
  }
  if (url === 'https://openrouter.ai/api/v1/models?supported_parameters=tools') {
    return json({
      data: [
        { id: 'z/other-model', name: 'Zeta Model', supported_parameters: ['tools'] },
        { id: 'anthropic/claude-sonnet-4', name: 'Anthropic: Claude Sonnet 4', supported_parameters: ['tools', 'reasoning'] },
        { id: 'no-tools/plain', name: 'No Tools', supported_parameters: ['temperature'] },
      ],
    });
  }
  if (url === 'https://openrouter.ai/api/v1/chat/completions') {
    const status = openrouterStatus.shift() ?? 200;
    const stream = (chunks: any[], headers = {}) => new Response(orSse(chunks), { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } });
    if (status === 'tool-then-text') {
      return stream([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_or_1', type: 'function', function: { name: 'get_schedule', arguments: '{"start":' } }] }, finish_reason: null }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'null,"days":1}' } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { total_tokens: 42 } },
      ]);
    }
    if (status === 'length') {
      return stream([
        { choices: [{ delta: { content: 'Delvist' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'length' }] },
      ]);
    }
    if (status === 'stream-error') {
      return stream([{ error: { code: 503, message: 'Provider overloaded' } }], { 'x-request-id': 'or_req_1' });
    }
    if (status === 'stream-error-late') {
      return stream([
        { choices: [{ delta: { content: 'Hal' }, finish_reason: null }] },
        { error: { code: 503, message: 'Dropped' } },
      ]);
    }
    if (status === 402) return json({ error: { code: 402, message: 'Insufficient credits' } }, 402);
    if (status === 429) return json({ error: { code: 429, message: 'Rate limited' } }, 429);
    if (status === 401) return json({ error: { code: 401, message: 'Invalid API key' } }, 401);
    return stream([
      { choices: [{ delta: { content: 'Hej ' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'fra OpenRouter!' }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { total_tokens: 15 } },
    ]);
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

describe('OpenRouter', () => {
  const getOrToken = () => openRouterTokenForApp();
  async function collectOr(request: any) {
    const events: any[] = [];
    try {
      for await (const event of openrouterResponses({ instructions: 'sys', tools: OPENROUTER_TOOLS, input: [{ role: 'user', content: 'Hej' }], ...request }, undefined, getOrToken)) {
        events.push(event);
      }
      return { events, error: undefined as any };
    } catch (error) {
      return { events, error: error as any };
    }
  }

  it('connects via OAuth PKCE callback or pasted URL, lists tool models and stores key separately', async () => {
    await startOpenRouterSignIn({ openerTabId: 4 });
    const authUrl = new URL(tabs.created.at(-1)!);
    expect(authUrl.origin + authUrl.pathname).toBe('https://openrouter.ai/auth');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const redirectUri = authUrl.searchParams.get('callback_url')!;
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/openrouter\/callback$/);
    expect(local.chatAccount.openrouter.pending).toBe(true);

    await onTabUpdated(7, { url: `${redirectUri}?code=or_code_1` });
    await until(() => local.chatAccount?.openrouter?.connected);
    expect(local.chatAccount.provider).toBe('openrouter');
    expect(local.chatAccount.openrouter.label).toBe('sk-or-v1-min-nøgle');
    // Popular models first, openrouter/auto ensured, non-tool models filtered out.
    expect(local.chatAccount.openrouter.models.map((m: any) => m.slug)).toEqual(['openrouter/auto', 'anthropic/claude-sonnet-4', 'z/other-model']);
    expect(local.openrouterKey).toBe('sk-or-v1-oauthkey123456');
    expect(JSON.stringify(local.chatAccount)).not.toContain('sk-or-v1-oauthkey123456');

    // Pasted callback also works.
    await startOpenRouterSignIn({});
    const secondRedirect = new URL(tabs.created.at(-1)!).searchParams.get('callback_url')!;
    expect((await pasteOpenRouterCallback('http://127.0.0.1:9999/other')).ok).toBe(false);
    expect(await pasteOpenRouterCallback(`${secondRedirect}?code=or_code_2`)).toEqual({ ok: true });
    expect(local.openrouterKey).toBe('sk-or-v1-oauthkey654321');
  });

  it('streams text and incremental tool calls through runTurn, handles retries and errors', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      // Full agentic turn: tool call round -> final text round.
      openrouterStatus = ['tool-then-text', 200];
      const before = requests.length;
      const toolCalls: any[] = [];
      const input: any[] = [{ role: 'user', content: 'Hvad har jeg i dag?' }];
      const parts = await runTurn({
        input,
        providerName: 'OpenRouter',
        stream: (history, signal) => openrouterResponses({ model: 'anthropic/claude-sonnet-4', effort: 'low', instructions: 'sys', tools: OPENROUTER_TOOLS, input: history }, signal, getOrToken),
        runTool: async (name, args) => {
          toolCalls.push([name, args]);
          return { ok: true, text: '# Skema', label: 'Læste skemaet', href: null };
        },
      });
      expect(toolCalls).toEqual([['get_schedule', { start: null, days: 1 }]]);
      expect(parts.map((p: any) => [p.type, p.label || p.text])).toEqual([['tool', 'Læste skemaet'], ['text', 'Hej fra OpenRouter!']]);
      const orCalls = requests.slice(before).filter(([u]) => u === 'https://openrouter.ai/api/v1/chat/completions');
      expect(orCalls.length).toBe(2);
      const firstBody = JSON.parse(orCalls[0][1].body);
      expect(firstBody.reasoning).toEqual({ effort: 'low' });
      expect(firstBody.tools[0].type).toBe('function');
      expect(firstBody.tools[0].function.strict).toBeUndefined();
      const secondBody = JSON.parse(orCalls[1][1].body);
      expect(secondBody.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
      expect(secondBody.messages[2].tool_calls[0].id).toBe('call_or_1');
      expect(secondBody.messages[3].tool_call_id).toBe('call_or_1');

      // Length finish_reason emits incomplete.
      openrouterStatus = ['length'];
      const truncated = await collectOr({ model: 'anthropic/claude-sonnet-4' });
      expect(truncated.events.some((e) => e.type === 'response.incomplete')).toBe(true);

      // 429 and early stream errors retry before output; late errors do not retry.
      openrouterStatus = [429, 'stream-error', 200];
      const retried = await collectOr({ model: 'anthropic/claude-sonnet-4' });
      expect(retried.error).toBeUndefined();
      expect(retried.events.slice(0, 2).map((e) => e.type)).toEqual(['lx.retrying', 'lx.retrying']);

      openrouterStatus = ['stream-error-late', 200];
      const late = await collectOr({ model: 'anthropic/claude-sonnet-4' });
      expect(late.error.kind).toBe('retry');
      expect(late.events.some((e) => e.type === 'response.output_text.delta')).toBe(true);

      // 402 insufficient credits -> limit, 401 -> reconnect.
      openrouterStatus = [402];
      expect((await collectOr({ model: 'anthropic/claude-sonnet-4' })).error.kind).toBe('limit');
      openrouterStatus = [401];
      expect((await collectOr({ model: 'anthropic/claude-sonnet-4' })).error.kind).toBe('reconnect');
    } finally {
      console.warn = warn;
      openrouterStatus = [200];
    }
  });

  it('validates manual API keys and disconnects cleanly', async () => {
    expect((await setOpenRouterKey('sk-or-v1-bad')).ok).toBe(false);
    expect(await setOpenRouterKey('sk-or-v1-manual-key-9999')).toEqual({ ok: true });
    expect(local.openrouterKey).toBe('sk-or-v1-manual-key-9999');
    expect((await openRouterTokenForApp()).token).toBe('sk-or-v1-manual-key-9999');

    await disconnectOpenRouter();
    expect(local.openrouterKey).toBeUndefined();
    expect(local.chatAccount.openrouter.connected).toBe(false);
    expect((await openRouterTokenForApp()).kind).toBe('reconnect');
  });

  it('converts history with tool calls and multimodal files for OpenRouter and supports custom model slugs', () => {
    const history = [
      { role: 'user', content: 'Læs pdf og billede' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Jeg kigger.' }] },
      { type: 'function_call', call_id: 'c1', name: 'read_document', arguments: '{"url":"a.pdf"}' },
      { type: 'function_call', call_id: 'c2', name: 'read_document', arguments: '{"url":"b.png"}' },
      {
        type: 'function_call_output',
        call_id: 'c1',
        output: toolOutput({ ok: true, text: 'PDF', label: '', files: [{ kind: 'file', name: 'a.pdf', mime: 'application/pdf', data: 'AA==' }] }),
      },
      {
        type: 'function_call_output',
        call_id: 'c2',
        output: toolOutput({ ok: true, text: 'IMG', label: '', files: [{ kind: 'image', name: 'b.png', mime: 'image/png', data: 'BB==' }] }),
      },
    ];
    const messages = openRouterMessages('Instruktioner', history);
    expect(messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'tool', 'user']);
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: 'Jeg kigger.',
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'read_document', arguments: '{"url":"a.pdf"}' } },
        { id: 'c2', type: 'function', function: { name: 'read_document', arguments: '{"url":"b.png"}' } },
      ],
    });
    expect(messages[5].content[1]).toEqual({ type: 'file', file: { filename: 'a.pdf', file_data: 'data:application/pdf;base64,AA==' } });
    expect(messages[5].content[2]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,BB==' } });

    // Backwards-compatible account merge + custom OpenRouter model slug.
    const merged = mergeAccount({ connected: false, openrouter: { connected: true, label: 'k', models: [], modelsAt: 0, model: 'google/gemini-2.5-pro:free', effort: '', pending: false, message: '' } });
    expect(activeProvider(merged)).toBe('openrouter');
    expect(modelOf(merged)).toEqual({ slug: 'google/gemini-2.5-pro:free', name: 'google/gemini-2.5-pro:free' });
  });
});
