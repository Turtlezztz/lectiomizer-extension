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

// Google Calendar sync. The OAuth client id is injected at build time (.env).
export const GOOGLE_CLIENT_ID = typeof __GOOGLE_CLIENT_ID__ === 'string' ? __GOOGLE_CLIENT_ID__ : '';
export const CALENDAR_DEFAULTS = { connected: false, email: '', calendarId: '', weeks: 4, cancelled: true };
export async function loadCalendar() {
  try { return { ...CALENDAR_DEFAULTS, ...(await api?.storage.local.get('calendar'))?.calendar }; }
  catch { return { ...CALENDAR_DEFAULTS }; }
}
export async function saveCalendar(patch) {
  const calendar = { ...(await loadCalendar()), ...patch };
  await api?.storage.local.set({ calendar });
  return calendar;
}
// { state: 'idle'|'syncing'|'ok'|'error', message, startedAt, checkedAt, syncedAt, lessons, weeks, reconnect }
export async function loadCalendarStatus() {
  try { return (await api?.storage.local.get('calendarStatus'))?.calendarStatus || {}; }
  catch { return {}; }
}
export async function saveCalendarStatus(patch) {
  const calendarStatus = { ...(await loadCalendarStatus()), ...patch };
  await api?.storage.local.set({ calendarStatus });
  return calendarStatus;
}
