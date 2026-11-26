// One chat turn against the Responses API (ported from v1's agent.js and the
// streaming half of session.js): stream the model's answer, run the Lectio
// tools it calls, send the results back, repeat until it answers. Runs in the
// app page, which has the Lectio session and a DOM; the access token comes
// from the background, which alone refreshes it.
import { API, ChatGPTError, errorFromBody, readEvents, requestBody, responseError } from './openai.js';
import { TOOL_GUIDE, TOOL_SPECS, specOf } from './tool-specs.js';
import type { AssistantTurn, Part, ToolPart, Turn } from './account';
import type { ToolResult } from './tools';

/** The tools as the Responses API takes them: grouped in a namespace, as plan usage requires. */
export const RESPONSES_TOOLS = [
  {
    type: 'namespace',
    name: 'lectio',
    description: "Read the signed-in student's own Lectio: schedule, assignments, lessons, messages, grades, absence and documents. Read-only.",
    tools: TOOL_SPECS.map((t: any) => ({ type: 'function', name: t.name, description: t.description, strict: true, parameters: t.parameters })),
  },
];

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
/** Pauses before retrying a request ChatGPT turned away for a moment. Tests shorten them. */
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
 * A Responses request as a stream of events. Busy servers and dropped
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
 * tools it used. `input` (the full Responses history) is extended in place.
 */
export async function runTurn({
  input,
  stream,
  runTool,
  onUpdate = () => {},
  signal,
  maxRounds = 12,
}: {
  input: any[];
  stream: Stream;
  runTool: RunTool;
  onUpdate?: (parts: Part[], status: string) => void;
  signal?: AbortSignal;
  maxRounds?: number;
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
          update('ChatGPT har travlt – prøver igen…');
        } else if (event.type === 'response.incomplete') {
          parts.push({ type: 'notice', text: 'Svaret blev afkortet af ChatGPT.' });
        }
      }
    } catch (error: any) {
      // A file the model can't take fails the whole request; drop files once.
      if ((error?.kind === 'unsupported' || error?.status === 400) && !retriedFiles && withoutFiles(input)) {
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
export function withoutFiles(input: any[]) {
  let changed = false;
  for (const item of input) {
    if (item.type !== 'function_call_output' || !Array.isArray(item.output)) continue;
    item.output = item.output.filter((part: any) => part.type === 'input_text').map((part: any) => part.text).join('\n') + '\n(Filens indhold kunne ikke sendes til ChatGPT.)';
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
export function failedReply(error: any, parts: Part[]): AssistantTurn {
  if (error?.name === 'AbortError') return { role: 'assistant', parts: savedParts(parts), stopped: true };
  const known = typeof error?.kind === 'string';
  if (!known) console.warn('Lectiomizer:', error);
  return {
    role: 'assistant',
    parts: savedParts(parts),
    error: known ? error.message : 'Noget gik galt. Prøv igen.',
    limit: error?.kind === 'limit',
    retry: !known || error.kind === 'retry' || error.kind === 'other',
    errorInfo: known ? [error.status && `HTTP ${error.status}`, error.code && `kode ${error.code}`, error.requestId].filter(Boolean).join(' · ') : '',
  };
}
