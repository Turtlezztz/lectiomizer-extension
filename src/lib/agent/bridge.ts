// The extension's side of the MCP server (mcp/server.mjs). An extension can't
// listen on a port, so the local MCP server does, and the background
// long-polls it for tool calls, runs them with the student's Lectio session
// and posts the results back. Only while the student has turned it on in
// Indstillinger, and only for a server that knows the pairing token.
import { getItem, setItem } from '../storage';

export const BRIDGE_KEY = 'mcpBridge';
export const BRIDGE_STATUS_KEY = 'mcpBridgeStatus';
export const DEFAULT_PORT = 47123;
/** Asked for when the student turns the bridge on. */
export const BRIDGE_ORIGINS = ['http://127.0.0.1/*'];

export interface BridgePrefs {
  enabled: boolean;
  token: string;
  port: number;
}
export interface BridgeStatus {
  state: 'off' | 'waiting' | 'connected';
  at: number;
  message?: string;
  calls?: number;
  lastCall?: { name: string; at: number; ok: boolean } | null;
}

export const BRIDGE_DEFAULTS: BridgePrefs = { enabled: false, token: '', port: DEFAULT_PORT };
export const loadBridge = async (): Promise<BridgePrefs> => ({ ...BRIDGE_DEFAULTS, ...(await getItem<Partial<BridgePrefs>>(BRIDGE_KEY, {})) });
export const saveBridge = async (patch: Partial<BridgePrefs>) => setItem(BRIDGE_KEY, { ...(await loadBridge()), ...patch });

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'lx_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface BridgeCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export type BridgeRunner = (call: BridgeCall) => Promise<unknown>;

const api = () => (globalThis as any).browser ?? (globalThis as any).chrome;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running: Promise<void> | null = null;
let status: BridgeStatus = { state: 'off', at: 0 };

async function setStatus(patch: Partial<BridgeStatus>) {
  const next = { ...status, ...patch, at: Date.now() };
  const changed = next.state !== status.state || next.message !== status.message || next.calls !== status.calls;
  status = next;
  if (changed) await setItem(BRIDGE_STATUS_KEY, status).catch(() => {});
}

/**
 * Polls the MCP server until the bridge is turned off or the server is gone.
 * Started on startup, on a settings change and by a once-a-minute alarm, so
 * a server started later is found within a minute. Safe to call repeatedly.
 */
export function startBridge(run: BridgeRunner): Promise<void> {
  running ??= loop(run).finally(() => {
    running = null;
  });
  return running;
}

async function loop(run: BridgeRunner) {
  let failures = 0;
  for (;;) {
    const prefs = await loadBridge();
    if (!prefs.enabled || !prefs.token) {
      await setStatus({ state: 'off', message: '' });
      return;
    }
    const base = `http://127.0.0.1:${prefs.port || DEFAULT_PORT}`;
    const headers = { Authorization: `Bearer ${prefs.token}` };
    // Any extension API call counts as activity, so Chrome and Firefox keep the background alive while connected.
    api()?.runtime?.getPlatformInfo?.().catch?.(() => {});
    let response: Response;
    try {
      response = await fetch(`${base}/bridge/next`, { headers, cache: 'no-store' });
    } catch {
      failures++;
      await setStatus({ state: 'waiting', message: 'Venter på MCP-serveren…' });
      // The alarm restarts the loop; don't hold the background open for a server that isn't there.
      if (failures >= 3) return;
      await sleep(3000);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      await setStatus({ state: 'waiting', message: 'MCP-serveren afviste nøglen. Tjek LECTIOMIZER_TOKEN.' });
      return;
    }
    failures = 0;
    await setStatus({ state: 'connected', message: '' });
    if (response.status === 204) continue;
    if (!response.ok) {
      await sleep(2000);
      continue;
    }
    let call: BridgeCall;
    try {
      call = await response.json();
    } catch {
      continue;
    }
    // Calls run side by side; a slow document download shouldn't hold up the next question.
    handle(base, headers, call, run);
  }
}

async function handle(base: string, headers: Record<string, string>, call: BridgeCall, run: BridgeRunner) {
  let result: any;
  try {
    result = await run(call);
  } catch (error) {
    result = { ok: false, text: `Fejl: ${(error as Error)?.message || error}`, label: 'Fejl' };
  }
  await setStatus({ calls: (status.calls || 0) + 1, lastCall: { name: call.name, at: Date.now(), ok: !!result?.ok } });
  try {
    await fetch(`${base}/bridge/result`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: call.id, result }) });
  } catch {}
}
