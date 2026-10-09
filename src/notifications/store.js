import { api, storedObject } from '../settings.js';
import { compareSchedule, compareFeeds, LOCK, scheduleScope } from './changes.js';
import { loadCalendar, nextSyncAt } from '../calendar/store.js';

export const SCHEDULE_STATE = 'scheduleHistory';
export const [loadScheduleState] = storedObject(SCHEDULE_STATE, { accounts: {} });
export const accountState = (state, scope) => state?.accounts?.[scope] || {};
let pending = Promise.resolve();

// All writes run in the background: multiple tabs cannot overwrite history or
// race the read marker. A claimed read has a token so late replies are ignored.
function update(scope, fn) {
  const run = pending.then(async () => {
    const state = await loadScheduleState();
    const previous = accountState(state, scope);
    const { value, result } = await fn(previous);
    if (value) await api.storage.local.set({ [SCHEDULE_STATE]: { accounts: { ...state.accounts, [scope]: value } } });
    return result;
  });
  pending = run.catch(() => {});
  return run;
}

export function claimSchedule(context, { force = false, now = Date.now() } = {}) {
  const scope = scheduleScope(context);
  if (!scope) return Promise.resolve({ started: false });
  return update(scope, async previous => {
    const status = previous.status || {};
    if (status.state === 'syncing' && now - status.startedAt < LOCK) return { result: { started: false, busy: true } };
    const settings = await loadCalendar();
    if (!force && now < nextSyncAt(settings, status)) return { result: { started: false } };
    const token = crypto.randomUUID();
    return { value: { ...previous, status: { ...status, state: 'syncing', startedAt: now, token, message: '' } }, result: { started: true, token } };
  });
}

export function observeSchedule(context, weeks, token, unread = 0, now = Date.now(), feeds = {}) {
  const scope = scheduleScope(context);
  if (!scope) return Promise.resolve({ ok: false });
  return update(scope, previous => {
    if (!token || previous.status?.token !== token) return { result: { ok: false, stale: true } };
    const value = compareFeeds(compareSchedule(previous, weeks, now), feeds, now);
    const warnings = [];
    if (unread) warnings.push(`${unread} ${unread === 1 ? 'uge kunne' : 'uger kunne'} ikke læses.`);
    if (!Array.isArray(feeds.lectioMessages)) warnings.push('Beskeder kunne ikke læses.');
    if (!Array.isArray(feeds.assignments)) warnings.push('Afleveringer kunne ikke læses.');
    value.status = { state: 'ok', checkedAt: now, message: warnings.length ? `${warnings.join(' ')} Prøver igen ved næste tjek.` : '' };
    return { value, result: { ok: true } };
  });
}

export function failSchedule(context, token, message, now = Date.now()) {
  const scope = scheduleScope(context);
  if (!scope) return Promise.resolve({ ok: false });
  return update(scope, previous => previous.status?.token === token ? {
    value: { ...previous, status: { state: 'error', checkedAt: now, message } }, result: { ok: false, message },
  } : { result: { ok: false, stale: true } });
}

export function markScheduleRead(context, ids) {
  const scope = scheduleScope(context);
  if (!scope || !Array.isArray(ids)) return Promise.resolve({ ok: false });
  const read = new Set(ids);
  return update(scope, previous => ({ value: { ...previous, messages: (previous.messages || []).map(message => read.has(message.id) ? { ...message, read: true } : message) }, result: { ok: true } }));
}
