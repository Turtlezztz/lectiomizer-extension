// Answers in progress, kept at module level so they carry on while the
// student moves around the app (only closing the tab stops them). The Lectio
// tools run right here in the app page: it has the Lectio session and a DOM,
// so unlike v1 no Lectio tab has to be open.
import { useSyncExternalStore } from 'react';
import { loadConversations, saveConversation, type AIProvider, type Conversation, type Part } from '@/lib/agent/account';
import {
  OPENROUTER_TOOLS,
  RESPONSES_TOOLS,
  failedReply,
  inputFromTurns,
  instructions,
  openrouterResponses,
  responses,
  runTurn,
  savedParts,
  type GetToken,
} from '@/lib/agent/agent';
import { createLectioTools } from '@/lib/agent/tools';
import { send } from '@/lib/sync/hooks';

export interface Job {
  parts: Part[];
  status: string;
  controller: AbortController;
}

export interface Context {
  provider: AIProvider;
  schoolId: string;
  school: string;
  name: string;
  model: string;
  effort: string;
}

const jobs = new Map<string, Job>();
// Full histories (tool results and files included) for follow-up questions,
// tagged with the provider that produced them so switching providers mid-chat
// rebuilds cleanly from saved text turns.
const memory = new Map<string, { provider: AIProvider; input: any[] }>();
const REMEMBER = 5;
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  for (const l of listeners) l();
};

function remember(id: string, provider: AIProvider, input: any[]) {
  memory.delete(id);
  memory.set(id, { provider, input });
  while (memory.size > REMEMBER) memory.delete(memory.keys().next().value!);
}

const getChatGPTToken: GetToken = (force) => send({ type: 'chat:token', force });
const getOpenRouterToken: GetToken = () => send({ type: 'openrouter:token' });

async function run(id: string, input: any[], context: Context) {
  const job: Job = { parts: [], status: 'Tænker…', controller: new AbortController() };
  jobs.set(id, job);
  emit();
  const tools = createLectioTools({ schoolId: context.schoolId, links: 'relative' });
  const isOpenRouter = context.provider === 'openrouter';
  const prompt = instructions({ name: context.name, school: context.school });
  const stream = isOpenRouter
    ? (history: any[], signal?: AbortSignal) =>
        openrouterResponses({ model: context.model, effort: context.effort, tools: OPENROUTER_TOOLS, input: history, instructions: prompt }, signal, getOpenRouterToken)
    : (history: any[], signal?: AbortSignal) =>
        responses({ model: context.model, effort: context.effort, tools: RESPONSES_TOOLS, input: history, instructions: prompt }, signal, getChatGPTToken);
  let reply;
  try {
    const parts = await runTurn({
      input,
      stream,
      runTool: (name, args) => tools.run(name, args),
      signal: job.controller.signal,
      providerName: isOpenRouter ? 'OpenRouter' : 'ChatGPT',
      onUpdate: (parts, status) => {
        job.parts = parts;
        job.status = status;
        emit();
      },
    });
    reply = { role: 'assistant' as const, provider: context.provider, parts: savedParts(parts) };
  } catch (error) {
    reply = failedReply(error, job.parts, context.provider);
    if ((error as any)?.kind === 'reconnect' && (error as any)?.status === 401) {
      send({ type: isOpenRouter ? 'openrouter:signed-out' : 'chat:signed-out', message: (error as Error).message }).catch(() => {});
    }
  }
  // Deleted while it ran: don't bring it back.
  const latest = (await loadConversations()).find((c) => c.id === id);
  if (latest) await saveConversation({ ...latest, turns: [...latest.turns, reply], updated: Date.now() }).catch(() => {});
  else memory.delete(id);
  jobs.delete(id);
  emit();
}

/** A new question: saved with the conversation at once, answered in the background of the app. */
export async function ask(id: string, question: string, context: Context): Promise<string | null> {
  if (jobs.has(id)) return 'Vent, til svaret er færdigt.';
  if (!context.model) return 'Vælg en model.';
  const saved = (await loadConversations()).find((c) => c.id === id);
  const title = question.replace(/\s+/g, ' ').trim();
  const conversation: Conversation = saved || { id, title: title.length > 60 ? title.slice(0, 57).trimEnd() + '…' : title, created: Date.now(), updated: Date.now(), turns: [] };
  const cached = memory.get(id);
  const input = cached && cached.provider === context.provider ? cached.input : inputFromTurns(conversation.turns);
  input.push({ role: 'user', content: question });
  remember(id, context.provider, input);
  await saveConversation({ ...conversation, turns: [...conversation.turns, { role: 'user', text: question }], updated: Date.now() });
  run(id, input, context);
  return null;
}

/** Answers the last question again, replacing an answer that failed. */
export async function retryAnswer(id: string, context: Context): Promise<string | null> {
  if (jobs.has(id)) return 'Vent, til svaret er færdigt.';
  if (!context.model) return 'Vælg en model.';
  const conversation = (await loadConversations()).find((c) => c.id === id);
  if (!conversation) return 'Samtalen findes ikke længere.';
  const last = conversation.turns.at(-1);
  const turns = last?.role === 'assistant' && (last.error || last.stopped) ? conversation.turns.slice(0, -1) : conversation.turns;
  if (turns.at(-1)?.role !== 'user') return 'Der er ikke noget spørgsmål at svare på.';
  if (turns !== conversation.turns) await saveConversation({ ...conversation, turns, updated: Date.now() });
  // The remembered history may hold the failed attempt; start from what was written.
  const input = inputFromTurns(turns);
  remember(id, context.provider, input);
  run(id, input, context);
  return null;
}

export const stop = (id: string) => jobs.get(id)?.controller.abort();
export const forget = (id: string) => {
  stop(id);
  memory.delete(id);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Re-renders on every change to any running answer. */
export function useJobs(): Map<string, Job> {
  useSyncExternalStore(subscribe, () => version);
  return jobs;
}
