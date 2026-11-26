// Chat answers run here, in the background script, so they carry on while the
// student moves around Lectio or closes the Chat page. The model's tool calls
// are handed to an open Lectio tab, which has the Lectio session. Chat pages
// watch over a port and show a running answer wherever they are opened.
import { api } from '../settings.js';
import { ACTIVITY, loadActivity, loadConversations, saveConversation } from './store.js';
import { responses } from './session.js';
import { inputFromTurns, runTurn, savedParts } from './agent.js';
import { RUNNING, TOOLS, instructions } from './tools.js';

const LECTIO = ['https://www.lectio.dk/*', 'https://lectio.dk/*'];
// Firefox suspends an idle background page after about 30 seconds, and
// listening to a stream doesn't count as activity. Calls to its own APIs do.
const KEEP_AWAKE = 20000;
// How long a tool call waits for a Lectio tab, e.g. while a page loads.
const TAB_TRIES = 10;
const TAB_PAUSE = 1000;
// Full histories (tool results and files included) kept for follow-up questions.
const REMEMBER = 5;

const jobs = new Map(); // conversation id → { parts, status, controller }
const memory = new Map(); // conversation id → Responses history
const watchers = new Map(); // port → the conversation id it shows
const unread = new Set();
let awake = null;

const wait = (ms, signal) => new Promise(resolve => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

const snapshot = id => {
  const job = jobs.get(id);
  return { type: 'job', id, running: !!job, parts: job?.parts || [], status: job?.status || '' };
};
function broadcast(id) {
  const message = snapshot(id);
  for (const port of watchers.keys()) try { port.postMessage(message); } catch {}
}
const publish = () => api.storage.local.set({ [ACTIVITY]: { running: [...jobs.keys()], unread: [...unread] } }).catch(() => {});

function keepAwake() {
  if (jobs.size && !awake) awake = setInterval(() => { api.runtime.getPlatformInfo().catch(() => {}); }, KEEP_AWAKE);
  if (!jobs.size && awake) { clearInterval(awake); awake = null; }
}

function remember(id, input) {
  memory.delete(id);
  memory.set(id, input);
  while (memory.size > REMEMBER) memory.delete(memory.keys().next().value);
}

// Tools that run in a Lectio tab of the same school: the one the question came
// from first, else the active or most recent one.
function lectioTools(context) {
  async function run(call, signal) {
    const message = { type: 'chat:tool', call: { name: call.name, arguments: call.arguments }, root: context.root, scheduleHref: context.scheduleHref };
    for (let attempt = 0; attempt < TAB_TRIES && !signal?.aborted; attempt++) {
      const tabs = (await api.tabs.query({ url: LECTIO })).filter(tab => (tab.url || '').startsWith(context.root));
      tabs.sort((a, b) => (b.id === context.tabId) - (a.id === context.tabId) || (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
      for (const tab of tabs) {
        try {
          const result = await api.tabs.sendMessage(tab.id, message, { frameId: 0 });
          if (result) return result;
        } catch {}
      }
      await wait(TAB_PAUSE, signal);
    }
    return { output: 'Fejl: Ingen Lectio-fane var åben, så Lectio kunne ikke læses. Bed eleven åbne Lectio og spørge igen.', label: 'Kunne ikke læse Lectio: åbn Lectio og prøv igen', ok: false };
  }
  return { run, runningLabel: call => RUNNING[call.name] || 'Arbejder' };
}

// The saved assistant turn when a turn didn't finish.
function failedReply(error, parts) {
  if (error?.name === 'AbortError') return { role: 'assistant', parts: savedParts(parts), stopped: true };
  const known = typeof error?.kind === 'string';
  if (!known) console.warn('Lectiomizer:', error);
  return {
    role: 'assistant', parts: savedParts(parts),
    error: known ? error.message : 'Noget gik galt. Prøv igen.',
    limit: error?.kind === 'limit',
    retry: !known || error.kind === 'retry' || error.kind === 'other',
    errorInfo: known ? [error.status && `HTTP ${error.status}`, error.code && `kode ${error.code}`, error.requestId].filter(Boolean).join(' · ') : '',
  };
}

async function run(id, input, context, settings) {
  const job = { parts: [], status: 'Tænker…', controller: new AbortController() };
  jobs.set(id, job);
  keepAwake();
  publish();
  broadcast(id);
  const tools = lectioTools(context);
  const stream = (history, signal) => responses({ model: settings.model, effort: settings.effort, tools: TOOLS, input: history, instructions: instructions(context) }, signal);
  let reply;
  try {
    const parts = await runTurn({ input, stream, tools, signal: job.controller.signal, onUpdate: (parts, status) => { job.parts = parts; job.status = status; broadcast(id); } });
    reply = { role: 'assistant', parts: savedParts(parts) };
  } catch (error) {
    reply = failedReply(error, job.parts);
  }
  // Deleted while it ran: don't bring it back.
  const latest = (await loadConversations()).find(c => c.id === id);
  if (latest) await saveConversation({ ...latest, turns: [...latest.turns, reply], updated: Date.now() }).catch(() => {});
  else memory.delete(id);
  jobs.delete(id);
  keepAwake();
  if (latest && !Array.from(watchers.values()).includes(id)) unread.add(id);
  publish();
  broadcast(id);
}

// Only values a Lectio page of the same site may ask for.
function readContext(context, sender) {
  const root = new URL(context?.root);
  if (root.origin !== new URL(sender.url).origin || !/^\/lectio\/\d+\/$/.test(root.pathname)) throw new Error('Ukendt skole');
  const scheduleHref = new URL(context.scheduleHref || 'SkemaNy.aspx', root);
  if (scheduleHref.origin !== root.origin) throw new Error('Ukendt skema');
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const pages = (Array.isArray(context.pages) ? context.pages : []).slice(0, 40).map(p => ({ label: text(p?.label, 60), url: text(p?.url, 300) })).filter(p => p.label && p.url);
  return { root: root.href, scheduleHref: scheduleHref.href, name: text(context.name, 120), school: text(context.school, 200), term: text(context.term, 40), pages, tabId: sender.tab?.id ?? null };
}
const readSettings = settings => ({ model: typeof settings?.model === 'string' ? settings.model : '', effort: ['low', 'medium', 'high'].includes(settings?.effort) ? settings.effort : '' });

// A new question: saved with the conversation at once, answered in the background.
export async function send(message, sender) {
  const id = typeof message.id === 'string' ? message.id.slice(0, 64) : '';
  const question = typeof message.question === 'string' ? message.question.trim().slice(0, 20000) : '';
  if (!id || !question) return { ok: false, message: 'Tomt spørgsmål.' };
  if (jobs.has(id)) return { ok: false, message: 'Vent, til svaret er færdigt.' };
  const settings = readSettings(message.settings);
  if (!settings.model) return { ok: false, message: 'Vælg en model.' };
  let context;
  try { context = readContext(message.context, sender); } catch { return { ok: false, message: 'Spørg fra din skoles Lectio.' }; }
  const saved = (await loadConversations()).find(c => c.id === id);
  const conversation = saved || { id, title: typeof message.title === 'string' ? message.title.slice(0, 80) : question.slice(0, 60), created: Date.now(), turns: [] };
  const input = memory.get(id) || inputFromTurns(conversation.turns);
  input.push({ role: 'user', content: question });
  remember(id, input);
  await saveConversation({ ...conversation, turns: [...conversation.turns, { role: 'user', text: question }], updated: Date.now() });
  run(id, input, context, settings);
  return { ok: true };
}

// Answers the last question again, replacing an answer that failed.
export async function retryAnswer(message, sender) {
  const id = typeof message.id === 'string' ? message.id : '';
  if (jobs.has(id)) return { ok: false, message: 'Vent, til svaret er færdigt.' };
  const conversation = (await loadConversations()).find(c => c.id === id);
  if (!conversation) return { ok: false, message: 'Samtalen findes ikke længere.' };
  const settings = readSettings(message.settings);
  let context;
  try { context = readContext(message.context, sender); } catch { return { ok: false, message: 'Spørg fra din skoles Lectio.' }; }
  const last = conversation.turns.at(-1);
  const turns = last?.role === 'assistant' && (last.error || last.stopped) ? conversation.turns.slice(0, -1) : conversation.turns;
  if (turns.at(-1)?.role !== 'user') return { ok: false, message: 'Der er ikke noget spørgsmål at svare på.' };
  if (turns !== conversation.turns) await saveConversation({ ...conversation, turns, updated: Date.now() });
  const input = memory.get(id) || inputFromTurns(turns);
  remember(id, input);
  run(id, input, context, settings);
  return { ok: true };
}

export function stop(message) {
  jobs.get(message?.id)?.controller.abort();
  return Promise.resolve({ ok: true });
}

// A Chat page watching: it hears about every running answer and says which
// conversation it shows, which then no longer counts as unread.
export function watch(port) {
  watchers.set(port, null);
  port.onDisconnect.addListener(() => watchers.delete(port));
  port.onMessage.addListener(message => {
    if (message?.type !== 'viewing') return;
    const id = typeof message.id === 'string' ? message.id : null;
    watchers.set(port, id);
    if (id && unread.delete(id)) publish();
  });
  for (const id of jobs.keys()) try { port.postMessage(snapshot(id)); } catch {}
}

// A fresh background page has no running answers; keep only what is unread.
export async function resetActivity() {
  const activity = await loadActivity();
  for (const id of activity.unread) unread.add(id);
  await publish();
}
