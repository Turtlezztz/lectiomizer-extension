// Small typed wrapper over extension storage, with localStorage in fixture/dev mode.
const ext: any = (globalThis as any).browser ?? (globalThis as any).chrome;
const hasExt = !!ext?.storage?.local && !!ext?.runtime?.id;

export async function getItem<T>(key: string, fallback: T): Promise<T> {
  if (hasExt) {
    const res = await ext.storage.local.get(key);
    return (res?.[key] ?? fallback) as T;
  }
  try {
    const raw = localStorage.getItem(`lx:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

const localListeners = new Map<string, Set<(value: unknown) => void>>();

export async function setItem<T>(key: string, value: T): Promise<void> {
  if (hasExt) return ext.storage.local.set({ [key]: value });
  try {
    localStorage.setItem(`lx:${key}`, JSON.stringify(value));
  } catch {}
  queueMicrotask(() => {
    localListeners.get(key)?.forEach((cb) => cb(value));
  });
}

export function onItemChange<T>(key: string, cb: (value: T) => void): () => void {
  if (!hasExt) {
    let set = localListeners.get(key);
    if (!set) localListeners.set(key, (set = new Set()));
    const fn = cb as (value: unknown) => void;
    set.add(fn);
    return () => {
      set!.delete(fn);
    };
  }
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && key in changes) cb(changes[key].newValue as T);
  };
  ext.storage.onChanged.addListener(listener);
  return () => ext.storage.onChanged.removeListener(listener);
}

export const isExtension = hasExt;
export const extApi = ext;
