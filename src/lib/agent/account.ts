// Chat settings, AI account state the UI shows (ChatGPT + OpenRouter), and
// saved conversations. Tokens and API keys are not here: only the background
// reads them (session.ts). Shared by the background, the app and Settings.
import { extApi, getItem, isExtension, setItem } from '../storage';

export const USAGE_URL = 'https://chatgpt.com/settings/usage';
export const OPENROUTER_USAGE_URL = 'https://openrouter.ai/settings/credits';
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/settings/keys';

/** Hosts ChatGPT sign-in and the Responses API need, asked for when the student connects. */
export const CHAT_ORIGINS = ['https://auth.openai.com/*', 'https://api.openai.com/*'];
/** Host OpenRouter sign-in and API need, asked for when the student connects OpenRouter. */
export const OPENROUTER_ORIGINS = ['https://openrouter.ai/*'];
/** Firefox's built-in data consent: Lectio content goes to the chosen AI provider. */
export const CHAT_DATA = ['websiteContent', 'personalCommunications'];

export type AIProvider = 'chatgpt' | 'openrouter';

export interface Model {
  slug: string;
  name: string;
}

export interface OpenRouterAccount {
  connected: boolean;
  label: string;
  models: Model[];
  modelsAt: number;
  model: string;
  effort: '' | 'low' | 'medium' | 'high';
  pending: boolean;
  message: string;
}

export interface ChatAccount {
  provider: AIProvider;
  connected: boolean;
  email: string;
  planEnabled: boolean;
  models: Model[];
  modelsAt: number;
  model: string;
  effort: '' | 'low' | 'medium' | 'high';
  /** Asked to sign in again (tokens expired or revoked). */
  reconnect: boolean;
  message: string;
  pending: boolean;
  openrouter: OpenRouterAccount;
}

export const ACCOUNT_KEY = 'chatAccount';
export const OPENROUTER_DEFAULTS: OpenRouterAccount = {
  connected: false,
  label: '',
  models: [],
  modelsAt: 0,
  model: '',
  effort: '',
  pending: false,
  message: '',
};
export const ACCOUNT_DEFAULTS: ChatAccount = {
  provider: 'chatgpt',
  connected: false,
  email: '',
  planEnabled: false,
  models: [],
  modelsAt: 0,
  model: '',
  effort: '',
  reconnect: false,
  message: '',
  pending: false,
  openrouter: OPENROUTER_DEFAULTS,
};

export function mergeAccount(raw?: Partial<ChatAccount> | null): ChatAccount {
  return {
    ...ACCOUNT_DEFAULTS,
    ...(raw || {}),
    openrouter: { ...OPENROUTER_DEFAULTS, ...(raw?.openrouter || {}) },
  };
}

export const loadAccount = async (): Promise<ChatAccount> => mergeAccount(await getItem<Partial<ChatAccount>>(ACCOUNT_KEY, {}));

export async function saveAccount(patch: Partial<ChatAccount>): Promise<ChatAccount> {
  const current = await loadAccount();
  const next: ChatAccount = {
    ...current,
    ...patch,
    openrouter: patch.openrouter ? { ...current.openrouter, ...patch.openrouter } : current.openrouter,
  };
  await setItem(ACCOUNT_KEY, next);
  return next;
}

export async function saveOpenRouter(patch: Partial<OpenRouterAccount>, extra?: Partial<Omit<ChatAccount, 'openrouter'>>): Promise<ChatAccount> {
  const current = await loadAccount();
  const next: ChatAccount = {
    ...current,
    ...(extra || {}),
    openrouter: { ...current.openrouter, ...patch },
  };
  await setItem(ACCOUNT_KEY, next);
  return next;
}

export const EFFORTS = [
  { value: '', label: 'Standard' },
  { value: 'low', label: 'Hurtig' },
  { value: 'high', label: 'Grundig' },
] as const;

export const isChatGPTReady = (account: ChatAccount) => account.connected && account.planEnabled;
export const isOpenRouterReady = (account: ChatAccount) => account.openrouter.connected;
export const isAssistantReady = (account: ChatAccount) => isChatGPTReady(account) || isOpenRouterReady(account);

/** The provider currently used for answers: the preferred one if ready, else whichever is ready. */
export function activeProvider(account: ChatAccount): AIProvider {
  if (account.provider === 'openrouter' && isOpenRouterReady(account)) return 'openrouter';
  if (account.provider === 'chatgpt' && isChatGPTReady(account)) return 'chatgpt';
  if (isOpenRouterReady(account)) return 'openrouter';
  if (isChatGPTReady(account)) return 'chatgpt';
  return account.provider || 'chatgpt';
}

/** The model the student picked, if available, else the provider's first. Custom OpenRouter slugs are kept. */
export function modelOf(account: ChatAccount, provider: AIProvider = activeProvider(account)): Model | null {
  if (provider === 'openrouter') {
    const or = account.openrouter;
    if (or.model) return or.models.find((m) => m.slug === or.model) || { slug: or.model, name: or.model };
    return or.models[0] || null;
  }
  return account.models.find((m) => m.slug === account.model) || account.models[0] || null;
}

async function requestOrigins(origins: string[]): Promise<boolean> {
  if (!isExtension) return true;
  try {
    return await extApi.permissions.request({ origins, data_collection: CHAT_DATA });
  } catch {
    // Chrome, and Firefox without built-in data consent, don't know data_collection.
    try {
      return await extApi.permissions.request({ origins });
    } catch {
      return false;
    }
  }
}

async function hasOrigins(origins: string[]): Promise<boolean> {
  if (!isExtension) return true;
  try {
    return await extApi.permissions.contains({ origins, data_collection: CHAT_DATA });
  } catch {
    try {
      return await extApi.permissions.contains({ origins });
    } catch {
      return true;
    }
  }
}

/** Host permissions (and Firefox data consent). Must run in a click handler. */
export const requestChatPermissions = () => requestOrigins(CHAT_ORIGINS);
export const hasChatPermissions = () => hasOrigins(CHAT_ORIGINS);
export const requestOpenRouterPermissions = () => requestOrigins(OPENROUTER_ORIGINS);
export const hasOpenRouterPermissions = () => hasOrigins(OPENROUTER_ORIGINS);

// ------------------------------------------------------------ conversations
// Conversations keep what the student and the assistant wrote and which
// Lectio pages and documents were read, never their contents.

export interface ToolPart {
  type: 'tool';
  name: string;
  label: string;
  href: string | null;
  status: 'running' | 'done' | 'error';
}
export interface TextPart {
  type: 'text' | 'notice';
  text: string;
  phase?: string | null;
}
export type Part = ToolPart | TextPart;

export interface UserTurn {
  role: 'user';
  text: string;
}
export interface AssistantTurn {
  role: 'assistant';
  parts: Part[];
  provider?: AIProvider;
  stopped?: boolean;
  error?: string;
  errorInfo?: string;
  limit?: boolean;
  retry?: boolean;
}
export type Turn = UserTurn | AssistantTurn;

export interface Conversation {
  id: string;
  title: string;
  created: number;
  updated: number;
  turns: Turn[];
}

export const CONVERSATIONS_KEY = 'chatConversations';
const KEEP = 30;

export const loadConversations = () => getItem<Conversation[]>(CONVERSATIONS_KEY, []);

export async function saveConversation(conversation: Conversation) {
  const list = (await loadConversations()).filter((c) => c.id !== conversation.id);
  list.unshift(conversation);
  await setItem(CONVERSATIONS_KEY, list.slice(0, KEEP));
}

export async function deleteConversation(id: string) {
  await setItem(CONVERSATIONS_KEY, (await loadConversations()).filter((c) => c.id !== id));
}

export const deleteConversations = () => setItem<Conversation[]>(CONVERSATIONS_KEY, []);
