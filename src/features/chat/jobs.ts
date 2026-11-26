// Answers in progress, kept at module level so they carry on while the
// student moves around the app (only closing the tab stops them). The Lectio
// tools run right here in the app page: it has the Lectio session and a DOM,
// so unlike v1 no Lectio tab has to be open.
import { useSyncExternalStore } from 'react';
import { loadConversations, saveConversation, type Conversation, type Part } from '@/lib/agent/account';
import { RESPONSES_TOOLS, failedReply, inputFromTurns, instructions, responses, runTurn, savedParts, type GetToken } from '@/lib/agent/agent';
import { createLectioTools } from '@/lib/agent/tools';
import { send } from '@/lib/sync/hooks';

export interface Job {
  parts: Part[];
  status: string;
  controller: AbortController;
}

export interface Context {
  schoolId: string;
  school: string;
  name: string;
  model: string;
  effort: string;
}

const jobs = new Map<string, Job>();
// Full histories (tool results and files included) for follow-up questions.
const memory = new Map<string, any[]>();
const REMEMBER = 5;
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  for (const l of listeners) l();
};

function remember(id: string, input: any[]) {
  memory.delete(id);
  memory.set(id, input);
  while (memory.size > REMEMBER) memory.delete(memory.keys().next().value!);
}

const getToken: GetToken = (force) => send({ type: 'chat:token', force });

async function run(id: string, input: any[], context: Context) {
  const job: Job = { parts: [], status: 'Tænker…', controller: new AbortController() };
  jobs.set(id, job);
  emit();
  const tools = createLectioTools({ schoolId: context.schoolId, links: 'relative' });
  const stream = (history: any[], signal?: AbortSignal) =>
    responses({ model: context.model, effort: context.effort, tools: RESPONSES_TOOLS, input: history, instructions: instructions({ name: context.name, school: context.school }) }, signal, getToken);
  let reply;
  try {
    const parts = await runTurn({
      input,
      stream,
      runTool: (name, args) => tools.run(name, args),
      signal: job.controller.signal,
      onUpdate: (parts, status) => {
        job.parts = parts;
        job.status = status;
        emit();
      },
    });
    reply = { role: 'assistant' as const, parts: savedParts(parts) };
  } catch (error) {
    reply = failedReply(error, job.parts);
    if ((error as any)?.kind === 'reconnect' && (error as any)?.status === 401) send({ type: 'chat:signed-out', message: (error as Error).message }).catch(() => {});
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
  const input = memory.get(id) || inputFromTurns(conversation.turns);
  input.push({ role: 'user', content: question });
  remember(id, input);
  await saveConversation({ ...conversation, turns: [...conversation.turns, { role: 'user', text: question }], updated: Date.now() });
  run(id, input, context);
  return null;
}

/** Answers the last question again, replacing an answer that failed. */
export async function retryAnswer(id: string, context: Context): Promise<string | null> {
  if (jobs.has(id)) return 'Vent, til svaret er færdigt.';
  const conversation = (await loadConversations()).find((c) => c.id === id);
  if (!conversation) return 'Samtalen findes ikke længere.';
  const last = conversation.turns.at(-1);
  const turns = last?.role === 'assistant' && (last.error || last.stopped) ? conversation.turns.slice(0, -1) : conversation.turns;
  if (turns.at(-1)?.role !== 'user') return 'Der er ikke noget spørgsmål at svare på.';
  if (turns !== conversation.turns) await saveConversation({ ...conversation, turns, updated: Date.now() });
  // The remembered history may hold the failed attempt; start from what was written.
  const input = inputFromTurns(turns);
  remember(id, input);
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
