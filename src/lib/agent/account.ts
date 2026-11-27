// Chat settings, the ChatGPT account state the UI shows, and saved
// conversations. Tokens are not here: only the background reads them
// (session.ts). Shared by the background, the app and the settings page.
import { extApi, getItem, isExtension, setItem } from '../storage';

export const USAGE_URL = 'https://chatgpt.com/settings/usage';
/** Hosts the sign-in and the Responses API need, asked for when the student connects. */
export const CHAT_ORIGINS = ['https://auth.openai.com/*', 'https://api.openai.com/*'];
/** Firefox's built-in data consent: Lectio content goes to OpenAI. */
// websiteContent is a required permission (granted at install), so only this one is requested.
export const CHAT_DATA = ['personalCommunications'];

export interface Model {
  slug: string;
  name: string;
}

export interface ChatAccount {
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
}

export const ACCOUNT_KEY = 'chatAccount';
export const ACCOUNT_DEFAULTS: ChatAccount = { connected: false, email: '', planEnabled: false, models: [], modelsAt: 0, model: '', effort: '', reconnect: false, message: '', pending: false };

export const loadAccount = async (): Promise<ChatAccount> => ({ ...ACCOUNT_DEFAULTS, ...(await getItem<Partial<ChatAccount>>(ACCOUNT_KEY, {})) });
export async function saveAccount(patch: Partial<ChatAccount>): Promise<ChatAccount> {
  const next = { ...(await loadAccount()), ...patch };
  await setItem(ACCOUNT_KEY, next);
  return next;
}

export const EFFORTS = [
  { value: '', label: 'Standard' },
  { value: 'low', label: 'Hurtig' },
  { value: 'high', label: 'Grundig' },
] as const;

/** The model the student picked, if the plan still offers it, else the plan's first. */
export const modelOf = (account: ChatAccount) => account.models.find((m) => m.slug === account.model) || account.models[0] || null;

/** Host permissions (and Firefox data consent). Must run in a click handler. */
export async function requestChatPermissions(): Promise<boolean> {
  if (!isExtension) return true;
  try {
    return await extApi.permissions.request({ origins: CHAT_ORIGINS, data_collection: CHAT_DATA });
  } catch {
    // Chrome, and Firefox without built-in data consent, don't know data_collection.
    try {
      return await extApi.permissions.request({ origins: CHAT_ORIGINS });
    } catch {
      return false;
    }
  }
}

export async function hasChatPermissions(): Promise<boolean> {
  if (!isExtension) return true;
  try {
    return await extApi.permissions.contains({ origins: CHAT_ORIGINS, data_collection: CHAT_DATA });
  } catch {
    try {
      return await extApi.permissions.contains({ origins: CHAT_ORIGINS });
    } catch {
      return true;
    }
  }
}

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
