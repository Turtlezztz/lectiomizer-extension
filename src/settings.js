export const api = typeof browser !== 'undefined' ? browser : undefined;

// One object in storage.local: read over its defaults, saved by merging a patch.
export function storedObject(key, defaults) {
  const load = async () => {
    try { return { ...defaults, ...(await api?.storage.local.get(key))?.[key] }; }
    catch { return { ...defaults }; }
  };
  const save = async patch => {
    const value = { ...(await load()), ...patch };
    await api?.storage.local.set({ [key]: value });
    return value;
  };
  return [load, save];
}

export const DEFAULTS = { enabled: true, collapsed: false, density: 'compact' };
export const [loadSettings, saveSettings] = storedObject('preferences', DEFAULTS);
