// The extension's bridge loop (src/lib/agent/bridge.ts) against the real MCP
// server: an MCP client's call reaches the runner and its result comes back.
import { afterAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const local: Record<string, any> = {};
(globalThis as any).browser = {
  runtime: { id: 'test', getPlatformInfo: async () => ({}) },
  storage: {
    local: {
      get: async (key: string) => ({ [key]: local[key] }),
      set: async (values: Record<string, any>) => void Object.assign(local, structuredClone(values)),
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};
const { saveBridge, startBridge, BRIDGE_STATUS_KEY } = await import('@/lib/agent/bridge');

const PORT = 48000 + Math.floor(Math.random() * 900);
const TOKEN = 'lx_bridge_test';
const server = spawn(process.execPath, ['mcp/server.mjs'], { env: { ...process.env, LECTIOMIZER_PORT: String(PORT), LECTIOMIZER_TOKEN: TOKEN, LECTIOMIZER_POLL_MS: '1000' }, stdio: ['pipe', 'pipe', 'pipe'] });
const replies = new Map<number, (m: any) => void>();
createInterface({ input: server.stdout }).on('line', (line) => {
  const m = JSON.parse(line);
  replies.get(m.id)?.(m);
});
const request = (id: number, method: string, params: unknown) =>
  new Promise<any>((resolve) => {
    replies.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

afterAll(async () => {
  await saveBridge({ enabled: false });
  server.kill();
});

describe('bridge', () => {
  it('carries a call from an MCP client to the runner and back', async () => {
    await new Promise((r) => setTimeout(r, 300));
    await saveBridge({ enabled: true, token: TOKEN, port: PORT });
    const seen: any[] = [];
    startBridge(async (call) => {
      seen.push(call);
      return { ok: true, text: `Overblik for ${call.name}`, label: 'x' };
    });
    const res = await request(1, 'tools/call', { name: 'get_overview', arguments: {} });
    expect(seen.map((c) => c.name)).toEqual(['get_overview']);
    expect(res.result).toEqual({ content: [{ type: 'text', text: 'Overblik for get_overview' }], isError: false });
    expect(local[BRIDGE_STATUS_KEY].state).toBe('connected');
  });

  it('stops when the token is wrong', async () => {
    await saveBridge({ enabled: false });
    await new Promise((r) => setTimeout(r, 50));
    await saveBridge({ enabled: true, token: 'lx_wrong', port: PORT });
    await startBridge(async () => ({ ok: true, text: '', label: '' }));
    expect(local[BRIDGE_STATUS_KEY].message).toMatch(/afviste nøglen/);
  }, 40_000);
});
