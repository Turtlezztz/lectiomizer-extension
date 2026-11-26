// Chat settings, account state and saved conversations, shared by the
// background script, the chat page in Lectio and the settings UI. Tokens are
// not here: only the background script reads them (see session.js).
import { api, storedObject } from '../settings.js';

// Shown to the user when they authorise Lectiomizer in ChatGPT.
export const AGENT_NAME = 'Lectiomizer';
export const USAGE_URL = 'https://chatgpt.com/settings/usage';
// Sending Lectio pages to OpenAI needs the user's data consent in Firefox.
export const CHAT_DATA = ['websiteContent', 'personalCommunications'];
// Hosts the sign-in and requests need; listed in the manifest, but Firefox
// lets users withhold host permissions, so the chat asks for them too.
export const CHAT_ORIGINS = ['https://auth.openai.com/*', 'https://api.openai.com/*', 'http://127.0.0.1/*'];

// Public account state for the UI: who is signed in, which models the plan
// offers and what the user picked. `reconnect` asks the user to sign in again.
export const ACCOUNT_DEFAULTS = { connected: false, email: '', planEnabled: false, models: [], modelsAt: 0, model: '', effort: '', welcomed: false, reconnect: false, message: '', pending: false };
export const [loadAccount, saveAccount] = storedObject('chatAccount', ACCOUNT_DEFAULTS);

export const EFFORTS = [
  { value: '', label: 'Standard' },
  { value: 'low', label: 'Hurtig' },
  { value: 'high', label: 'Grundig' },
];

// The model the user picked, if the plan still offers it, else the plan's first.
export function modelOf(account) {
  return account.models.find(m => m.slug === account.model) || account.models[0] || null;
}

// Conversations keep what the user and the assistant wrote and which Lectio
// pages and documents were read, never the page or document contents.
const KEY = 'chatConversations';
const KEEP = 30;

export async function loadConversations() {
  try { return (await api?.storage.local.get(KEY))?.[KEY] || []; }
  catch { return []; }
}

export async function saveConversation(conversation) {
  const list = (await loadConversations()).filter(c => c.id !== conversation.id);
  list.unshift(conversation);
  await api?.storage.local.set({ [KEY]: list.slice(0, KEEP) });
}

export async function deleteConversation(id) {
  await api?.storage.local.set({ [KEY]: (await loadConversations()).filter(c => c.id !== id) });
}

export async function deleteConversations() {
  await api?.storage.local.remove(KEY);
}

// Answers in progress and answers that finished while the student was
// elsewhere, for the sidebar's Chat link: { running: [ids], unread: [ids] }.
export const ACTIVITY = 'chatActivity';
export async function loadActivity() {
  try { return { running: [], unread: [], ...(await api?.storage.local.get(ACTIVITY))?.[ACTIVITY] }; }
  catch { return { running: [], unread: [] }; }
}
