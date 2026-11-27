// One chat turn against ChatGPT (Responses API) or OpenRouter (Chat
// Completions API): stream the model's answer, run the Lectio tools it calls,
// send the results back, repeat until it answers. Runs in the app page, which
// has the Lectio session and a DOM; tokens/keys come from the background.
import { API, ChatGPTError, errorFromBody, readEvents, requestBody, responseError } from './openai.js';
import {
  OPENROUTER_API,
  OPENROUTER_HEADERS,
  OpenRouterError,
  openRouterErrorFromBody,
  openRouterRequestBody,
  openRouterResponseError,
  openRouterTools,
} from './openrouter.js';
import { TOOL_GUIDE, TOOL_SPECS, specOf } from './tool-specs.js';
import type { AIProvider, AssistantTurn, Part, ToolPart, Turn } from './account';
import type { ToolResult } from './tools';

/** The tools as OpenAI's Responses API takes them: grouped in a namespace, as plan usage requires. */
export const RESPONSES_TOOLS = [
  {
    type: 'namespace',
    name: 'lectio',
    description: "Read the signed-in student's own Lectio: schedule, assignments, lessons, messages, grades, absence and documents. Read-only.",
    tools: TOOL_SPECS.map((t: any) => ({ type: 'function', name: t.name, description: t.description, strict: true, parameters: t.parameters })),
  },
];

/** The same tools as standard Chat Completions function tools for OpenRouter. */
export const OPENROUTER_TOOLS = openRouterTools(TOOL_SPECS);

export const runningLabel = (name: string) => specOf(name)?.running || 'Arbejder';

const longDate = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' });

/** Developer instructions for every request: who the student is, what time it is, and how to use the tools. */
export function instructions({ name, school, now = new Date() }: { name?: string; school?: string; now?: Date }) {
  return [
    'You are the assistant inside Lectiomizer, a browser extension for Lectio, the school system Danish upper-secondary students use. You talk with the signed-in student.',
    `Student: ${name || 'unknown'}. School: ${school || 'unknown'}. Now: ${longDate.format(now)} (Danish time).`,
    'Answer in the language the student writes in (usually Danish). Be brief and concrete; use short lists or a table when it helps. Write dates like "fredag 9/10 kl. 23:59".',
    '',
    '# Tools',
    ...TOOL_GUIDE.map((line: string) => `- ${line}`),
    '- When you mention a Lectio page, link it in Markdown with the address exactly as the tool gave it, e.g. [Novelleanalyse](ElevAflevering.aspx?exerciseid=1). Never add images.',
    '- For assignments, help the student understand the task, plan and improve their own work; don\'t write it for them.',
  ].join('\n');
}

// ------------------------------------------------------------------ streaming

export type GetToken = (force: boolean) => Promise<{ ok: boolean; token?: string; kind?: string; message?: string }>;

// Events a turn needs; the rest of the stream is dropped.
const FORWARD = new Set(['response.output_text.delta', 'response.output_item.added', 'response.output_item.done', 'response.incomplete']);
/** Pauses before retrying a request the provider turned away for a moment. Tests shorten them. */
export const retry = { delays: [1500, 4000, 8000] };
const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
const aborted = () => new DOMException('Stoppet', 'AbortError');

async function* streamOnce(body: string, signal: AbortSignal | undefined, getToken: GetToken): AsyncGenerator<any> {
  let response: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken(attempt > 0);
    if (!token.ok) throw new ChatGPTError(token.message || 'Log ind med ChatGPT.', { kind: token.kind || 'reconnect' });
    response = await fetch(`${API}/responses`, {
      method: 'POST',
      credentials: 'omit',
      signal,
      body,
      headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    });
    if (response.status === 401 && attempt === 0) continue;
    if (!response.ok) throw await responseError(response);
    break;
  }
  for await (const event of readEvents(response!.body!, signal)) {
    if (FORWARD.has(event.type)) yield event;
    else if (event.type === 'response.completed') {
      yield { type: event.type, usage: event.response?.usage || null };
      return;
    } else if (event.type === 'response.failed' || event.type === 'error') {
      console.warn('Lectiomizer: ChatGPT-fejl i svaret', JSON.stringify(event).slice(0, 4000));
      const error = errorFromBody(0, event);
      (error as any).requestId = response!.headers.get('x-request-id') || '';
      throw error;
    }
  }
  throw new ChatGPTError('Svaret fra ChatGPT blev afbrudt. Prøv igen.', { kind: 'retry' });
}

/**
 * A ChatGPT Responses request as a stream of events. Busy servers and dropped
 * connections are retried while nothing has been shown, with an
 * 'lx.retrying' event so the chat can say so.
 */
export async function* responses(request: { model: string; effort?: string; instructions: string; input: any[]; tools: any[] }, signal: AbortSignal | undefined, getToken: GetToken) {
  const body = JSON.stringify(requestBody({ ...request, effort: request.effort || '' }));
  for (let attempt = 0; ; attempt++) {
    let shown = false;
    try {
      for await (const event of streamOnce(body, signal, getToken)) {
        if (event.type !== 'response.completed') shown = true;
        yield event;
      }
      return;
    } catch (error: any) {
      if (signal?.aborted) throw aborted();
      const known = error instanceof ChatGPTError ? error : new ChatGPTError('Kunne ikke nå ChatGPT. Tjek din forbindelse og prøv igen.', { kind: 'retry' });
      if (!(error instanceof ChatGPTError)) console.warn('Lectiomizer:', error);
      if (shown || (known as any).kind !== 'retry' || attempt >= retry.delays.length) throw known;
      yield { type: 'lx.retrying', attempt: attempt + 1 };
      await pause(retry.delays[attempt], signal);
      if (signal?.aborted) throw aborted();
    }
  }
}

// ------------------------------------------------------ OpenRouter streaming

let orSeq = 0;

async function* streamOpenRouterOnce(body: string, signal: AbortSignal | undefined, getToken: GetToken): AsyncGenerator<any> {
  const token = await getToken(false);
  if (!token.ok) throw new OpenRouterError(token.message || 'Forbind OpenRouter.', { kind: token.kind || 'reconnect' });
  const response = await fetch(`${OPENROUTER_API}/chat/completions`, {
    method: 'POST',
    credentials: 'omit',
    signal,
    body,
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...OPENROUTER_HEADERS,
    },
  });
  if (!response.ok) throw await openRouterResponseError(response);

  const requestId = response.headers?.get?.('x-request-id') || response.headers?.get?.('cf-ray') || '';
  let msgId = '';
  let text = '';
  let finishReason = '';
  let usage: any = null;
  const toolCalls = new Map<number, { id: string; name: string; arguments: string; announced: boolean }>();

  for await (const chunk of readEvents(response.body!, signal)) {
    if (chunk.error) {
      console.warn('Lectiomizer: OpenRouter-fejl i svaret', JSON.stringify(chunk).slice(0, 4000));
      const error = openRouterErrorFromBody(0, chunk);
      (error as any).requestId = requestId;
      throw error;
    }
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta;
    if (!delta) continue;

    if (typeof delta.content === 'string' && delta.content) {
      if (!msgId) {
        msgId = `or_msg_${++orSeq}`;
        yield { type: 'response.output_item.added', item: { type: 'message', id: msgId, phase: null } };
      }
      text += delta.content;
      yield { type: 'response.output_text.delta', item_id: msgId, delta: delta.content };
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = typeof tc.index === 'number' ? tc.index : 0;
        let entry = toolCalls.get(idx);
        if (!entry) {
          entry = { id: tc.id || `or_call_${++orSeq}`, name: '', arguments: '', announced: false };
          toolCalls.set(idx, entry);
        } else if (tc.id) {
          entry.id = tc.id;
        }
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.arguments += tc.function.arguments;
        if (entry.name && !entry.announced) {
          entry.announced = true;
          yield { type: 'response.output_item.added', item: { type: 'function_call', id: entry.id, name: entry.name } };
        }
      }
    }
  }

  if (finishReason === 'error') {
    throw new OpenRouterError('OpenRouter afbrød svaret med en fejl. Prøv igen.', { kind: 'retry', requestId });
  }
  if (!finishReason && !msgId && !toolCalls.size) {
    throw new OpenRouterError('Svaret fra OpenRouter blev afbrudt. Prøv igen.', { kind: 'retry', requestId });
  }
  if (msgId) {
    yield {
      type: 'response.output_item.done',
      item: { type: 'message', id: msgId, role: 'assistant', phase: null, content: [{ type: 'output_text', text }] },
    };
  }
  for (const [, tc] of Array.from(toolCalls.entries()).sort((a, b) => a[0] - b[0])) {
    yield {
      type: 'response.output_item.done',
      item: { type: 'function_call', id: tc.id, call_id: tc.id, name: tc.name, arguments: tc.arguments || '{}' },
    };
  }
  if (finishReason === 'length') yield { type: 'response.incomplete' };
  yield { type: 'response.completed', usage };
}

/**
 * An OpenRouter Chat Completions request normalised to the same event stream as
 * `responses()`, with matching pre-output retries.
 */
export async function* openrouterResponses(
  request: { model: string; effort?: string; instructions: string; input: any[]; tools: any[] },
  signal: AbortSignal | undefined,
  getToken: GetToken,
) {
  const body = JSON.stringify(openRouterRequestBody({ ...request, effort: request.effort || '' }));
  for (let attempt = 0; ; attempt++) {
    let shown = false;
    try {
      for await (const event of streamOpenRouterOnce(body, signal, getToken)) {
        if (event.type !== 'response.completed') shown = true;
        yield event;
      }
      return;
    } catch (error: any) {
      if (signal?.aborted) throw aborted();
      const known = error instanceof ChatGPTError ? error : new OpenRouterError('Kunne ikke nå OpenRouter. Tjek din forbindelse og prøv igen.', { kind: 'retry' });
      if (!(error instanceof ChatGPTError)) console.warn('Lectiomizer:', error);
      if (shown || (known as any).kind !== 'retry' || attempt >= retry.delays.length) throw known;
      yield { type: 'lx.retrying', attempt: attempt + 1 };
      await pause(retry.delays[attempt], signal);
      if (signal?.aborted) throw aborted();
    }
  }
}

// ------------------------------------------------------------------ a turn

/** A tool result as Responses function_call_output: text, or text plus the file. */
export function toolOutput(result: ToolResult): string | any[] {
  if (!result.files?.length) return result.text;
  return [
    { type: 'input_text', text: result.text },
    ...result.files.map((f) =>
      f.kind === 'image'
        ? { type: 'input_image', image_url: `data:${f.mime};base64,${f.data}`, detail: 'auto' }
        : { type: 'input_file', filename: f.name, file_data: `data:${f.mime};base64,${f.data}` },
    ),
  ];
}

const replayable = (item: any) => {
  const { created_by, ...rest } = item;
  return rest;
};
const messageText = (item: any) => (item.content || []).map((part: any) => part.text || part.refusal || '').join('');

export type Stream = (input: any[], signal?: AbortSignal) => AsyncIterable<any>;
export type RunTool = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>;

/**
 * Display parts of an assistant turn, in order: text the model wrote and the
 * tools it used. `input` (the full history) is extended in place.
 */
export async function runTurn({
  input,
  stream,
  runTool,
  onUpdate = () => {},
  signal,
  maxRounds = 12,
  providerName = 'ChatGPT',
}: {
  input: any[];
  stream: Stream;
  runTool: RunTool;
  onUpdate?: (parts: Part[], status: string) => void;
  signal?: AbortSignal;
  maxRounds?: number;
  providerName?: string;
}): Promise<Part[]> {
  const parts: Part[] = [];
  const update = (status: string) => onUpdate(parts.map((p) => ({ ...p })), status);
  let retriedFiles = false;
  for (let round = 0; round < maxRounds; round++) {
    const items: any[] = [];
    const byId = new Map<string, any>();
    const mark = parts.length;
    update('Tænker…');
    try {
      for await (const event of stream(input, signal)) {
        if (event.type === 'response.output_item.added' && event.item?.type === 'message') {
          const part = { type: 'text' as const, text: '', phase: event.item.phase || null };
          byId.set(event.item.id, part);
          parts.push(part);
        } else if (event.type === 'response.output_text.delta') {
          let part = byId.get(event.item_id);
          if (!part) {
            part = { type: 'text', text: '', phase: null };
            byId.set(event.item_id, part);
            parts.push(part);
          }
          part.text += event.delta || '';
          update('');
        } else if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
          update(runningLabel(event.item.name) + '…');
        } else if (event.type === 'response.output_item.done' && event.item) {
          items.push(replayable(event.item));
          if (event.item.type === 'message') {
            let part = byId.get(event.item.id);
            if (!part) {
              part = { type: 'text', text: '', phase: null };
              parts.push(part);
            }
            part.text = messageText(event.item);
            part.phase = event.item.phase || part.phase;
            part.done = true;
          }
        } else if (event.type === 'lx.retrying') {
          update(`${providerName} har travlt – prøver igen…`);
        } else if (event.type === 'response.incomplete') {
          parts.push({ type: 'notice', text: `Svaret blev afkortet af ${providerName}.` });
        }
      }
    } catch (error: any) {
      // A file the model can't take fails the whole request; drop files once.
      if ((error?.kind === 'unsupported' || error?.status === 400) && !retriedFiles && withoutFiles(input, providerName)) {
        retriedFiles = true;
        parts.length = mark;
        round--;
        continue;
      }
      // Keep what the student saw, and close any tool calls left open.
      const shown = Array.from(byId.values()).filter((p) => !p.done && p.text).map((p) => p.text).join('\n\n');
      input.push(...items);
      if (shown) input.push({ role: 'assistant', content: shown });
      for (const call of items.filter((i) => i.type === 'function_call')) input.push({ type: 'function_call_output', call_id: call.call_id, output: 'Afbrudt.' });
      throw error;
    }
    for (const part of byId.values()) delete part.done;
    input.push(...items);
    const calls = items.filter((item) => item.type === 'function_call');
    if (!calls.length) {
      update('');
      return parts;
    }
    const tooling: ToolPart[] = calls.map((call) => {
      const part: ToolPart = { type: 'tool', name: call.name, label: runningLabel(call.name) + '…', href: null, status: 'running' };
      parts.push(part);
      return part;
    });
    update(tooling[0].label);
    const results = await Promise.all(
      calls.map((call) => {
        let args = {};
        try {
          args = JSON.parse(call.arguments || '{}');
        } catch {}
        return runTool(call.name, args, signal);
      }),
    );
    calls.forEach((call, i) => {
      const result = results[i];
      Object.assign(tooling[i], { label: result.label, href: result.href || null, status: result.ok ? 'done' : 'error' });
      input.push({ type: 'function_call_output', call_id: call.call_id, output: toolOutput(result) });
    });
    if (signal?.aborted) throw aborted();
  }
  parts.push({ type: 'notice', text: 'Jeg stoppede, fordi svaret krævede for mange opslag. Spørg gerne mere præcist.' });
  update('');
  return parts;
}

/** Replaces file contents in tool results with a note. True if any changed. */
export function withoutFiles(input: any[], providerName = 'ChatGPT') {
  let changed = false;
  for (const item of input) {
    if (item.type !== 'function_call_output' || !Array.isArray(item.output)) continue;
    item.output =
      item.output
        .filter((part: any) => part.type === 'input_text')
        .map((part: any) => part.text)
        .join('\n') + `\n(Filens indhold kunne ikke sendes til ${providerName}.)`;
    changed = true;
  }
  return changed;
}

/** History rebuilt from a saved conversation, which keeps only what was written. */
export function inputFromTurns(turns: Turn[]) {
  const input: any[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') input.push({ role: 'user', content: turn.text });
    else
      for (const part of turn.parts || []) {
        if (part.type === 'text' && part.text) input.push({ role: 'assistant', content: part.text, ...(part.phase ? { phase: part.phase } : {}) });
      }
  }
  return input;
}

/** What a saved conversation keeps of an assistant turn. */
export const savedParts = (parts: Part[]): Part[] =>
  parts.map((p) =>
    p.type === 'tool'
      ? { type: 'tool', name: p.name, label: p.label, href: p.href || null, status: p.status === 'running' ? 'error' : p.status }
      : { type: p.type, text: p.text, ...(p.phase ? { phase: p.phase } : {}) },
  );

/** The saved assistant turn when a turn didn't finish. */
export function failedReply(error: any, parts: Part[], provider?: AIProvider): AssistantTurn {
  if (error?.name === 'AbortError') return { role: 'assistant', parts: savedParts(parts), ...(provider ? { provider } : {}), stopped: true };
  const known = typeof error?.kind === 'string';
  if (!known) console.warn('Lectiomizer:', error);
  return {
    role: 'assistant',
    parts: savedParts(parts),
    ...(provider ? { provider } : {}),
    error: known ? error.message : 'Noget gik galt. Prøv igen.',
    limit: error?.kind === 'limit',
    retry: !known || error.kind === 'retry' || error.kind === 'other',
    errorInfo: known ? [error.status && `HTTP ${error.status}`, error.code && `kode ${error.code}`, error.requestId].filter(Boolean).join(' · ') : '',
  };
}
