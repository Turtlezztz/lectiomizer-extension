// OpenRouter API client: OAuth PKCE sign-in, API key validation, model listing
// and Chat Completions request/error helpers. Pure functions with injectable
// fetch, so everything runs in the background script, the app and tests.
import { ChatGPTError } from './openai.js';

export const OPENROUTER_ORIGIN = 'https://openrouter.ai';
export const OPENROUTER_AUTH_URL = `${OPENROUTER_ORIGIN}/auth`;
export const OPENROUTER_API = `${OPENROUTER_ORIGIN}/api/v1`;
export const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://github.com/Turtlezztz/lectiomizer-extension',
  'X-Title': 'Lectiomizer',
};

/** Well-known tool-capable models shown first when present in OpenRouter's catalog. */
export const POPULAR_OPENROUTER_SLUGS = [
  'openrouter/auto',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-r1',
  'meta-llama/llama-4-maverick',
  'qwen/qwen3-235b-a22b',
];

export class OpenRouterError extends ChatGPTError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'OpenRouterError';
  }
}

export function openRouterCallbackUri(port) {
  return `http://127.0.0.1:${port}/openrouter/callback`;
}

export function openRouterAuthorizeUrl({ redirectUri, challenge }) {
  const params = {
    callback_url: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  };
  return `${OPENROUTER_AUTH_URL}?${new URLSearchParams(params)}`;
}

export function readOpenRouterCallback(url) {
  const params = new URL(url).searchParams;
  const error = params.get('error');
  if (error === 'access_denied') throw new OpenRouterError('Du afviste adgangen i OpenRouter.', { code: error });
  if (error) throw new OpenRouterError(params.get('error_description') || 'OpenRouter-login fejlede.', { code: error });
  const code = params.get('code');
  if (!code) throw new OpenRouterError('OpenRouter sendte ingen login-kode.');
  return { code };
}

export async function exchangeOpenRouterCode({ fetch = globalThis.fetch, code, verifier }) {
  const response = await fetch(`${OPENROUTER_API}/auth/keys`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...OPENROUTER_HEADERS },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!response.ok) throw await openRouterResponseError(response);
  const body = await response.json().catch(() => ({}));
  if (!body.key) throw new OpenRouterError('OpenRouter returnerede ingen API-nøgle.');
  return { key: String(body.key), userId: body.user_id ? String(body.user_id) : '' };
}

export function maskApiKey(key) {
  const s = String(key || '').trim();
  if (s.length <= 12) return 'API-nøgle';
  return `${s.slice(0, 9)}…${s.slice(-4)}`;
}

export async function checkOpenRouterKey({ fetch = globalThis.fetch, key }) {
  const response = await fetch(`${OPENROUTER_API}/key`, {
    credentials: 'omit',
    headers: { Authorization: `Bearer ${key}`, ...OPENROUTER_HEADERS },
  });
  if (!response.ok) throw await openRouterResponseError(response);
  const body = await response.json().catch(() => ({}));
  const data = body?.data || {};
  return {
    label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : maskApiKey(key),
    limit: data.limit ?? null,
    limitRemaining: data.limit_remaining ?? null,
    isFreeTier: Boolean(data.is_free_tier),
  };
}

/** Tool-capable models on OpenRouter, with popular models first and the rest sorted by name. */
export async function listOpenRouterModels({ fetch = globalThis.fetch, key = '' } = {}) {
  const headers = { ...OPENROUTER_HEADERS, ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  const response = await fetch(`${OPENROUTER_API}/models?supported_parameters=tools`, { credentials: 'omit', headers });
  if (!response.ok) throw await openRouterResponseError(response);
  const body = await response.json().catch(() => ({}));
  const raw = Array.isArray(body.data) ? body.data : [];
  const bySlug = new Map();
  for (const m of raw) {
    if (!m?.id) continue;
    if (Array.isArray(m.supported_parameters) && !m.supported_parameters.includes('tools')) continue;
    bySlug.set(m.id, { slug: m.id, name: m.name || m.id });
  }
  if (!bySlug.has('openrouter/auto')) bySlug.set('openrouter/auto', { slug: 'openrouter/auto', name: 'OpenRouter Auto' });
  const popular = [];
  for (const slug of POPULAR_OPENROUTER_SLUGS) {
    const model = bySlug.get(slug);
    if (model) {
      popular.push(model);
      bySlug.delete(slug);
    }
  }
  const rest = Array.from(bySlug.values()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [...popular, ...rest];
}

function findError(body) {
  for (const candidate of [body?.error?.error, body?.error, body]) {
    if (candidate && typeof candidate === 'object' && (candidate.message || candidate.code)) return candidate;
  }
  return typeof body?.error === 'string' ? { message: body.error } : {};
}

export function openRouterErrorFromBody(status, body = {}) {
  const error = findError(body);
  const code = String(error.code ?? (error.type && error.type !== 'error' ? error.type : '') ?? '');
  const numericCode = Number(error.code) || 0;
  const effectiveStatus = status || (numericCode >= 400 && numericCode < 600 ? numericCode : 0);
  const metaRaw = error.metadata?.raw;
  const rawDetail = typeof metaRaw === 'string' ? metaRaw : metaRaw ? JSON.stringify(metaRaw) : '';
  const baseMessage = String(error.message || (typeof body?.detail === 'string' ? body.detail : '') || '');
  const detail = (rawDetail && /provider returned error/i.test(baseMessage) ? rawDetail : baseMessage || rawDetail).slice(0, 300);
  const param = error.param || '';

  let kind;
  let message;
  if (effectiveStatus === 401) {
    kind = 'reconnect';
    message = 'Din OpenRouter-nøgle er ugyldig eller udløbet. Forbind OpenRouter igen.';
  } else if (effectiveStatus === 402) {
    kind = 'limit';
    message = 'Du har ikke nok kredit på din OpenRouter-konto.';
  } else if (effectiveStatus === 429) {
    kind = 'retry';
    message = 'For mange forespørgsler til OpenRouter lige nu. Vent lidt, og prøv igen.';
  } else if (effectiveStatus === 408 || effectiveStatus === 502 || effectiveStatus === 503 || effectiveStatus >= 500) {
    kind = 'retry';
    message = 'OpenRouter er ikke tilgængelig lige nu. Prøv igen om lidt.';
  } else if (effectiveStatus === 404) {
    kind = 'other';
    message = detail ? `OpenRouter svarede: ${detail}` : 'Modellen findes ikke på OpenRouter. Vælg en anden model.';
  } else if (effectiveStatus === 400 && /\b(file|pdf|image|vision|multimodal|document|attachment|media)\b/i.test(detail)) {
    kind = 'unsupported';
    message = `OpenRouter kunne ikke bruge en vedhæftet fil (${detail}).`;
  } else {
    kind = 'other';
    message = detail ? `OpenRouter svarede: ${detail}` : `OpenRouter svarede ${effectiveStatus || 'med en fejl'} uden forklaring.`;
  }
  return new OpenRouterError(message, { kind, status: effectiveStatus, code, param, detail });
}

export async function openRouterResponseError(response) {
  const text = await response.text().catch(() => '');
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { detail: text.slice(0, 200) };
  }
  const error = openRouterErrorFromBody(response.status, body);
  error.requestId = response.headers?.get?.('x-request-id') || response.headers?.get?.('cf-ray') || '';
  return error;
}

/** Standard Chat Completions tool definitions for OpenRouter (no strict flag, so all providers accept them). */
export function openRouterTools(specs) {
  return specs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

const textOfMessage = (item) =>
  typeof item.content === 'string'
    ? item.content
    : (item.content || []).map((part) => part.text || part.refusal || '').join('');

/**
 * Converts canonical Responses-style history (`input`) into Chat Completions
 * `messages` for OpenRouter:
 * - merges adjacent assistant text + tool calls into one assistant message
 * - turns function_call_output into `role: 'tool'` messages
 * - moves multimodal attachments (images / PDFs) into a follow-up `user`
 *   message right after the tool results, since most providers only accept
 *   plain strings in `role: 'tool'`.
 */
export function openRouterMessages(instructions, input) {
  const messages = [];
  if (instructions) messages.push({ role: 'system', content: instructions });

  let pendingFiles = [];
  const flushFiles = () => {
    if (!pendingFiles.length) return;
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: 'Vedhæftede filer fra dokumentopslaget:' }, ...pendingFiles],
    });
    pendingFiles = [];
  };

  for (const item of input) {
    if (item.type === 'function_call_output') {
      if (Array.isArray(item.output)) {
        const textParts = [];
        for (const part of item.output) {
          if (part.type === 'input_text') textParts.push(part.text || '');
          else if (part.type === 'input_image' && part.image_url) pendingFiles.push({ type: 'image_url', image_url: { url: part.image_url } });
          else if (part.type === 'input_file' && part.file_data) pendingFiles.push({ type: 'file', file: { filename: part.filename || 'document', file_data: part.file_data } });
        }
        const text = textParts.join('\n') + (pendingFiles.length ? '\n(Vedhæftet fil følger i næste besked.)' : '');
        messages.push({ role: 'tool', tool_call_id: item.call_id, content: text });
      } else {
        messages.push({ role: 'tool', tool_call_id: item.call_id, content: String(item.output ?? '') });
      }
      continue;
    }

    flushFiles();

    if (item.role === 'user') {
      messages.push({ role: 'user', content: String(item.content ?? '') });
    } else if (item.type === 'function_call') {
      const call = { id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments || '{}' } };
      const prev = messages.at(-1);
      if (prev && prev.role === 'assistant') {
        prev.tool_calls = [...(prev.tool_calls || []), call];
      } else {
        messages.push({ role: 'assistant', content: null, tool_calls: [call] });
      }
    } else if (item.role === 'assistant' || item.type === 'message') {
      const text = textOfMessage(item);
      if (!text) continue;
      const prev = messages.at(-1);
      if (prev && prev.role === 'assistant' && !prev.tool_calls?.length) {
        prev.content = prev.content ? `${prev.content}\n\n${text}` : text;
      } else {
        messages.push({ role: 'assistant', content: text });
      }
    }
  }

  flushFiles();
  return messages;
}

export function openRouterRequestBody({ model, instructions, input, tools, effort }) {
  return {
    model,
    messages: openRouterMessages(instructions, input),
    ...(tools?.length ? { tools } : {}),
    stream: true,
    ...(effort ? { reasoning: { effort } } : {}),
  };
}
