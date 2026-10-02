export const DEFAULTS = { enabled: true, collapsed: false, density: 'compact' };
export const api = typeof browser !== 'undefined' ? browser : undefined;
export async function loadSettings() {
  try { return { ...DEFAULTS, ...(await api?.storage.local.get('preferences'))?.preferences }; }
  catch { return { ...DEFAULTS }; }
}
export async function saveSettings(patch) {
  const preferences = { ...(await loadSettings()), ...patch };
  await api?.storage.local.set({ preferences });
  return preferences;
}
