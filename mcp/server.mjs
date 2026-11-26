#!/usr/bin/env node
// Lectiomizer MCP server: lets an MCP client (Claude Desktop, Claude Code,
// Cursor, ChatGPT's desktop app …) read the student's Lectio through the
// Lectiomizer extension, with the same read-only tools as the in-app
// assistant.
//
//   MCP client ──stdio──▶ this server ◀──HTTP long-poll── Lectiomizer (browser)
//
// The browser holds the Lectio session; this process never sees a password
// or a cookie. An extension can't listen on a port, so this server listens on
// 127.0.0.1 and the extension polls it for tool calls. Both sides share a
// pairing token (LECTIOMIZER_TOKEN, shown in Lectiomizer → Indstillinger).
//
// Several clients may start their own copy. The first one owns the port; the
// others forward their calls to it, and take over if it goes away.
//
// No dependencies: Node 18+.
import http from 'node:http';
import { createInterface } from 'node:readline';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { TOOL_SPECS, TOOL_GUIDE } from '../src/lib/agent/tool-specs.js';

const VERSION = '1.0.0';
const PORT = Number(process.env.LECTIOMIZER_PORT) || 47123;
const TOKEN = (process.env.LECTIOMIZER_TOKEN || '').trim();
const POLL_MS = Number(process.env.LECTIOMIZER_POLL_MS) || 25_000;
// How long a call waits for the browser to pick it up, and to answer.
const PICKUP_MS = Number(process.env.LECTIOMIZER_PICKUP_MS) || 65_000;
const ANSWER_MS = 120_000;
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const log = (...args) => process.stderr.write(`[lectiomizer-mcp] ${args.join(' ')}\n`);

// ------------------------------------------------------------------ bridge

const queue = []; // calls waiting for the browser
const waiting = new Set(); // browser polls waiting for a call
const pending = new Map(); // id → { resolve, timer }
let lastSeen = 0; // when the browser last polled

const sameToken = (value) => {
  if (!TOKEN || typeof value !== 'string') return false;
  const a = Buffer.from(value);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};
const authorized = (req) => sameToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

function dispatch() {
  while (queue.length && waiting.size) {
    const poll = waiting.values().next().value;
    waiting.delete(poll);
    poll(queue.shift());
  }
}

/** Runs a tool in the browser. Resolves with the extension's ToolResult. */
function callBrowser(name, args) {
  return new Promise((resolve) => {
    const id = randomUUID();
    const call = { id, name, arguments: args || {} };
    const fail = (text) => {
      pending.delete(id);
      const index = queue.indexOf(call);
      if (index >= 0) queue.splice(index, 1);
      resolve({ ok: false, text });
    };
    const pickup = setTimeout(() => {
      if (queue.includes(call)) fail(notConnected());
    }, Date.now() - lastSeen < POLL_MS + 10_000 ? ANSWER_MS : PICKUP_MS);
    const answer = setTimeout(() => fail('Fejl: Lectiomizer svarede ikke i tide.'), ANSWER_MS);
    pending.set(id, {
      resolve: (result) => {
        clearTimeout(pickup);
        clearTimeout(answer);
        pending.delete(id);
        resolve(result);
      },
    });
    queue.push(call);
    dispatch();
  });
}

const notConnected = () =>
  'Fejl: Lectiomizer er ikke forbundet. Åbn browseren med Lectiomizer, slå "MCP-server" til under Indstillinger → Assistent, og tjek at LECTIOMIZER_TOKEN passer. (Udvidelsen leder efter serveren én gang i minuttet.)';

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Only the extension (or another copy of this server) may talk to us. Web
// pages can reach 127.0.0.1 too, but they don't know the token, and they get
// no CORS headers.
function cors(req, res) {
  const origin = req.headers.origin || '';
  if (/^(chrome|moz|safari-web)-extension:\/\//.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/health') return json(res, 200, { name: 'lectiomizer-mcp', version: VERSION });
  if (!authorized(req)) return json(res, 401, { error: 'unauthorized' });
  try {
    if (req.method === 'GET' && url.pathname === '/bridge/next') {
      lastSeen = Date.now();
      let done = false;
      const poll = (call) => {
        if (done) return queue.unshift(call);
        done = true;
        clearTimeout(timer);
        json(res, 200, call);
      };
      const timer = setTimeout(() => {
        waiting.delete(poll);
        done = true;
        res.writeHead(204).end();
      }, POLL_MS);
      req.on('close', () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          waiting.delete(poll);
        }
      });
      waiting.add(poll);
      return dispatch();
    }
    if (req.method === 'POST' && url.pathname === '/bridge/result') {
      lastSeen = Date.now();
      const { id, result } = JSON.parse(await readBody(req));
      pending.get(id)?.resolve(result);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/call') {
      const { name, arguments: args } = JSON.parse(await readBody(req, 1024 * 1024));
      return json(res, 200, await callBrowser(name, args));
    }
    if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, { connected: Date.now() - lastSeen < POLL_MS + 10_000, queued: queue.length });
    json(res, 404, { error: 'not found' });
  } catch (error) {
    json(res, 400, { error: String(error?.message || error) });
  }
});

let owner = false;
let listening = null;
/** Tries to own the port. False when another copy already does. */
function listen() {
  if (owner) return Promise.resolve(true);
  listening ??= new Promise((resolve) => {
    const onError = (error) => {
      server.off('listening', onListening);
      listening = null;
      if (error.code !== 'EADDRINUSE') log('kunne ikke lytte:', error.message);
      resolve(false);
    };
    const onListening = () => {
      server.off('error', onError);
      owner = true;
      log(`lytter på http://127.0.0.1:${PORT}`);
      resolve(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(PORT, '127.0.0.1');
  });
  return listening;
}

/** A tool call: run it ourselves if we own the port, else through the copy that does. */
async function runTool(name, args) {
  if (!TOKEN) return { ok: false, text: 'Fejl: LECTIOMIZER_TOKEN mangler. Kopiér nøglen fra Lectiomizer → Indstillinger → Assistent ind i MCP-klientens konfiguration.' };
  if (owner || (await listen())) return callBrowser(name, args);
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/call`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
      signal: AbortSignal.timeout(ANSWER_MS + 5_000),
    });
    if (response.status === 401) return { ok: false, text: 'Fejl: En anden Lectiomizer-MCP-server kører på samme port med en anden nøgle.' };
    return await response.json();
  } catch {
    // The owner went away: take over.
    if (await listen()) return callBrowser(name, args);
    return { ok: false, text: `Fejl: Port ${PORT} er optaget af et andet program. Vælg en anden med LECTIOMIZER_PORT (også i Lectiomizer).` };
  }
}

// ------------------------------------------------------------------ MCP (JSON-RPC over stdio)

const tools = TOOL_SPECS.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.parameters,
  annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

const INSTRUCTIONS = [
  "These tools read the user's own Lectio (the school system Danish upper-secondary students use) through the Lectiomizer browser extension, with the user's existing Lectio login. The user is usually a student.",
  ...TOOL_GUIDE,
  'Links in results are full lectio.dk addresses; give them to the user as they are.',
].join('\n');

/** An extension ToolResult → MCP tool result content. */
export function toContent(result) {
  const content = [{ type: 'text', text: String(result?.text ?? '') }];
  for (const file of result?.files || []) {
    if (file.kind === 'image') content.push({ type: 'image', data: file.data, mimeType: file.mime });
    else content.push({ type: 'resource', resource: { uri: result.href || `lectio:///${encodeURIComponent(file.name)}`, mimeType: file.mime, blob: file.data } });
  }
  return { content, isError: !result?.ok };
}

export async function handle(message) {
  const { id, method, params } = message || {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const error = (code, text) => ({ jsonrpc: '2.0', id, error: { code, message: text } });
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'lectiomizer', title: 'Lectiomizer (Lectio)', version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools });
    case 'tools/call': {
      const name = params?.name;
      if (!tools.some((t) => t.name === name)) return error(-32602, `Unknown tool: ${name}`);
      return reply(toContent(await runTool(name, params?.arguments || {})));
    }
    case 'resources/list':
      return reply({ resources: [] });
    case 'prompts/list':
      return reply({ prompts: [] });
    default:
      if (id === undefined || id === null) return null; // a notification
      return error(-32601, `Method not found: ${method}`);
  }
}

function main() {
  if (!TOKEN) log('LECTIOMIZER_TOKEN mangler – værktøjerne svarer med en fejl, indtil den er sat.');
  else listen();
  const send = (message) => message && process.stdout.write(JSON.stringify(message) + '\n');
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const batch = Array.isArray(message) ? message : [message];
    for (const m of batch) {
      handle(m).then(send, (e) => send({ jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32603, message: String(e?.message || e) } }));
    }
  });
  rl.on('close', () => process.exit(0));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.mjs')) main();
