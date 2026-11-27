// Chat account and conversations for the app (live from extension storage),
// and starting ChatGPT / OpenRouter sign-in from a click.
import { useEffect, useState } from 'react';
import { getItem, isExtension, onItemChange } from '@/lib/storage';
import { send } from '@/lib/sync/hooks';
import {
  ACCOUNT_KEY,
  CONVERSATIONS_KEY,
  mergeAccount,
  requestChatPermissions,
  requestOpenRouterPermissions,
  type ChatAccount,
  type Conversation,
} from '@/lib/agent/account';

export function useStored<T>(key: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let alive = true;
    getItem<T>(key, fallback).then((v) => alive && setValue(v));
    const off = onItemChange<T>(key, (v) => setValue(v ?? fallback));
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

export const useChatAccount = (): ChatAccount => mergeAccount(useStored<Partial<ChatAccount>>(ACCOUNT_KEY, {}));
export const useConversations = () => useStored<Conversation[]>(CONVERSATIONS_KEY, []);

/** Starts Sign in with ChatGPT: asks for the OpenAI hosts (must be in the click), then opens OpenAI. */
export async function connectChatGPT(consent = false): Promise<string> {
  if (!isExtension) return 'Virker kun når Lectiomizer kører som udvidelse.';
  if (!(await requestChatPermissions())) return 'Lectiomizer skal have lov til at kontakte ChatGPT for at kunne svare.';
  const result = await send({ type: 'chat:connect', consent });
  return result?.ok ? '' : result?.message || 'Kunne ikke starte login. Prøv igen.';
}

/** Starts OpenRouter OAuth PKCE sign-in: asks for openrouter.ai host permission, then opens OpenRouter. */
export async function connectOpenRouter(): Promise<string> {
  if (!isExtension) return 'Virker kun når Lectiomizer kører som udvidelse.';
  if (!(await requestOpenRouterPermissions())) return 'Lectiomizer skal have lov til at kontakte OpenRouter for at kunne svare.';
  const result = await send({ type: 'openrouter:connect' });
  return result?.ok ? '' : result?.message || 'Kunne ikke starte OpenRouter-login. Prøv igen.';
}

/** Validates and stores an OpenRouter API key. Asks for openrouter.ai host permission in the click. */
export async function saveOpenRouterApiKey(key: string): Promise<string> {
  if (!isExtension) return 'Virker kun når Lectiomizer kører som udvidelse.';
  if (!(await requestOpenRouterPermissions())) return 'Lectiomizer skal have lov til at kontakte OpenRouter for at kunne svare.';
  const result = await send({ type: 'openrouter:set-key', key });
  return result?.ok ? '' : result?.message || 'Kunne ikke forbinde til OpenRouter. Prøv igen.';
}
