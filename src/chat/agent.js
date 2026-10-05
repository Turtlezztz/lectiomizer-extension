// One chat turn: stream the model's answer, run the tool calls it makes,
// send the results back, and repeat until it answers. It runs in the
// background script (jobs.js); the tools run in an open Lectio tab.

export class ChatError extends Error {
  constructor({ message, kind = 'other', code = '', param = '', status = 0, requestId = '' }) {
    super(message);
    this.name = 'ChatError';
    Object.assign(this, { kind, code, param, status, requestId });
  }
}

const aborted = () => new DOMException('Stoppet', 'AbortError');

// Output items are replayed as they came, minus output-only fields.
const replayable = item => { const { created_by, ...rest } = item; return rest; };
const messageText = item => (item.content || []).map(part => part.text || part.refusal || '').join('');

// Display parts of an assistant turn, in order: text the model wrote and the
// tools it used. `input` (the full Responses history) is extended in place.
export async function runTurn({ input, stream, tools, onUpdate = () => {}, signal, maxRounds = 12 }) {
  const parts = [];
  const update = status => onUpdate(parts.map(p => ({ ...p })), status);
  let retriedFiles = false;
  for (let round = 0; round < maxRounds; round++) {
    const items = [];
    const byId = new Map();
    const mark = parts.length;
    update('Tænker…');
    try {
      for await (const event of stream(input, signal)) {
        if (event.type === 'response.output_item.added' && event.item?.type === 'message') {
          const part = { type: 'text', text: '', phase: event.item.phase || null };
          byId.set(event.item.id, part);
          parts.push(part);
        } else if (event.type === 'response.output_text.delta') {
          let part = byId.get(event.item_id);
          if (!part) { part = { type: 'text', text: '', phase: null }; byId.set(event.item_id, part); parts.push(part); }
          part.text += event.delta || '';
          update('');
        } else if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
          update(tools.runningLabel(event.item) + '…');
        } else if (event.type === 'response.output_item.done' && event.item) {
          items.push(replayable(event.item));
          if (event.item.type === 'message') {
            const part = byId.get(event.item.id) || (parts.push({ type: 'text', text: '', phase: null }), parts.at(-1));
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
    } catch (error) {
      // A file the model can't take fails the whole request; drop files once.
      if ((error?.kind === 'unsupported' || error?.status === 400) && !retriedFiles && withoutFiles(input)) {
        retriedFiles = true;
        parts.length = mark;
        round--;
        continue;
      }
      // Keep what the student saw, and close any tool calls left open.
      const shown = Array.from(byId.values()).filter(p => !p.done && p.text).map(p => p.text).join('\n\n');
      input.push(...items);
      if (shown) input.push({ role: 'assistant', content: shown });
      for (const call of items.filter(i => i.type === 'function_call')) input.push({ type: 'function_call_output', call_id: call.call_id, output: 'Afbrudt.' });
      throw error;
    }
    input.push(...items);
    const calls = items.filter(item => item.type === 'function_call');
    if (!calls.length) { update(''); return parts; }
    const tooling = calls.map(call => {
      const part = { type: 'tool', name: call.name, label: tools.runningLabel(call) + '…', status: 'running' };
      parts.push(part);
      return part;
    });
    update(tooling[0].label);
    const results = await Promise.all(calls.map(call => tools.run(call, signal)));
    calls.forEach((call, i) => {
      const result = results[i];
      Object.assign(tooling[i], { label: result.label, href: result.href || null, status: result.ok ? 'done' : 'error' });
      input.push({ type: 'function_call_output', call_id: call.call_id, output: result.output });
    });
    if (signal?.aborted) throw aborted();
  }
  parts.push({ type: 'notice', text: 'Jeg stoppede, fordi svaret krævede for mange opslag. Spørg gerne mere præcist.' });
  update('');
  return parts;
}

// Replaces file contents in tool results with a note. True if any changed.
export function withoutFiles(input) {
  let changed = false;
  for (const item of input) {
    if (item.type !== 'function_call_output' || !Array.isArray(item.output)) continue;
    if (!item.output.some(part => part.type === 'input_file' || part.type === 'input_image')) continue;
    item.output = item.output.filter(part => part.type === 'input_text').map(part => part.text).join('\n') + '\n(Filens indhold kunne ikke sendes til ChatGPT.)';
    changed = true;
  }
  return changed;
}

// History rebuilt from a saved conversation, which keeps only what was
// written. The model can read pages again when it needs them.
export function inputFromTurns(turns) {
  const input = [];
  for (const turn of turns) {
    if (turn.role === 'user') input.push({ role: 'user', content: turn.text });
    else for (const part of turn.parts || []) {
      if (part.type === 'text' && part.text) input.push({ role: 'assistant', content: part.text, ...(part.phase ? { phase: part.phase } : {}) });
    }
  }
  return input;
}

// What a saved conversation keeps of an assistant turn.
export const savedParts = parts => parts.map(p => p.type === 'tool' ? { type: 'tool', name: p.name, label: p.label, href: p.href || null, status: p.status === 'running' ? 'error' : p.status } : { type: p.type, text: p.text, ...(p.phase ? { phase: p.phase } : {}) });
