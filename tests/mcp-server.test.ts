// The MCP server end to end: an MCP client on stdio, and a fake extension
// long-polling the bridge for tool calls.
import { afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const PORT = 47000 + Math.floor(Math.random() * 900);
const TOKEN = 'lx_test_token';
const env = { ...process.env, LECTIOMIZER_PORT: String(PORT), LECTIOMIZER_TOKEN: TOKEN, LECTIOMIZER_PICKUP_MS: '1500' };

function client() {
  const child = spawn(process.execPath, ['mcp/server.mjs'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiters = new Map<number, (m: any) => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    const m = JSON.parse(line);
    waiters.get(m.id)?.(m);
  });
  let n = 0;
  const request = (method: string, params?: unknown) =>
    new Promise<any>((resolve) => {
      const id = ++n;
      waiters.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  return { child, request };
}

const base = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${TOKEN}` };
/** A fake extension: answers `count` calls, then stops. */
async function extension(count: number, answer: (call: any) => any) {
  const seen: any[] = [];
  while (seen.length < count) {
    const res = await fetch(`${base}/bridge/next`, { headers: auth });
    if (res.status !== 200) continue;
    const call = await res.json();
    seen.push(call);
    await fetch(`${base}/bridge/result`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: call.id, result: answer(call) }) });
  }
  return seen;
}

const a = client();
const b = client();
// A server no extension has polled: calls fail with an explanation instead of hanging.
const lonely = (() => {
  const child = spawn(process.execPath, ['mcp/server.mjs'], { env: { ...env, LECTIOMIZER_PORT: String(PORT + 1) }, stdio: ['pipe', 'pipe', 'pipe'] });
  return child;
})();
afterAll(() => {
  lonely.kill();
  a.child.kill();
  b.child.kill();
});

describe('mcp server', () => {
  it('initializes and lists the read-only Lectio tools', async () => {
    const init = await a.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(init.result.serverInfo.name).toBe('lectiomizer');
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.instructions).toMatch(/Lectio/);
    const list = await a.request('tools/list');
    const names = list.result.tools.map((t: any) => t.name);
    expect(names).toContain('get_schedule');
    expect(names).toContain('read_message');
    expect(list.result.tools.every((t: any) => t.annotations.readOnlyHint && t.inputSchema.type === 'object')).toBe(true);
  });

  it('rejects the bridge without the token', async () => {
    await new Promise((r) => setTimeout(r, 300));
    expect((await fetch(`${base}/bridge/next`)).status).toBe(401);
    expect((await fetch(`${base}/bridge/next`, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
  });

  it('runs a call in the extension and returns text and files', async () => {
    const ext = extension(1, (call) => ({ ok: true, text: `skema fra ${call.arguments.start}`, files: [{ kind: 'image', mime: 'image/png', data: 'AAAA', name: 'x.png' }], label: 'x' }));
    const res = await a.request('tools/call', { name: 'get_schedule', arguments: { start: '2026-11-16', days: 1 } });
    const [call] = await ext;
    expect(call.name).toBe('get_schedule');
    expect(res.result.isError).toBe(false);
    expect(res.result.content[0]).toEqual({ type: 'text', text: 'skema fra 2026-11-16' });
    expect(res.result.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
  });

  it('a second copy forwards its calls to the one that owns the port', async () => {
    await b.request('initialize', { protocolVersion: '2024-11-05' });
    const ext = extension(1, () => ({ ok: false, text: 'Fejl: Lectio-sessionen er udløbet.' }));
    const res = await b.request('tools/call', { name: 'get_grades', arguments: {} });
    await ext;
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/udløbet/);
  });

  it('explains when the extension is not connected', async () => {
    const reply = new Promise<any>((resolve) => createInterface({ input: lonely.stdout }).on('line', (line) => resolve(JSON.parse(line))));
    lonely.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_overview', arguments: {} } }) + '\n');
    const res = await reply;
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/ikke forbundet/);
  });

  it('refuses unknown tools', async () => {
    const unknown = await a.request('tools/call', { name: 'hand_in', arguments: {} });
    expect(unknown.error.code).toBe(-32602);
  });
});
