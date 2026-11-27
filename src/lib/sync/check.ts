// One background check: read Lectio, compare with the stored snapshot, record
// notifications, show system notifications, then update Google Calendar.
// Local notifications are committed before Google is contacted, so a Google
// problem never costs the student their notifications.
import { browser } from 'wxt/browser';
import { compareAll, scheduleScope, LOCK } from './changes.js';
import { HISTORY_KEY, digestDue, inQuietHours, isCheckDue, loadHistory, loadPrefs, typeEnabled, typeOfKind, updateHistory, type AccountState, type Notice, type NoticeKind, type SyncPrefs } from './store';
import { getItem } from '../storage';
import { syncToGoogle } from './calendar';
import { noticeBody, noticeTitle } from './notice';
import type { LectioRead, ReadExtras } from './read';

export type Reader = (args: { schoolId: string; weekCount: number } & ReadExtras) => Promise<LectioRead | { error: string; login?: boolean; paused?: boolean }>;

let inFlight: Promise<unknown> | null = null;
let lastStart = 0;

/** Set by checkNow so the app can show progress without a scope yet. */
async function setStatus(scope: string | undefined, patch: AccountState['status']) {
  await updateHistory((history) => {
    const key = scope || history.current;
    if (!key) return { result: null };
    const account = history.accounts[key] || {};
    return { value: { ...history, accounts: { ...history.accounts, [key]: { ...account, status: { ...account.status, ...patch } } } }, result: null };
  });
}

export async function runCheck(read: Reader, { force = false, onOpen = false } = {}) {
  if (inFlight && Date.now() - lastStart < LOCK) return inFlight;
  const settings = await getItem<{ school?: { id: string } | null }>('settings', {});
  const schoolId = settings.school?.id;
  if (!schoolId) return { ok: false, message: 'Ingen skole valgt' };
  const prefs = await loadPrefs();
  const history = await loadHistory();
  const status = history.current ? history.accounts[history.current]?.status : undefined;
  if (!isCheckDue(prefs, status?.checkedAt, { force, onOpen })) return { ok: true, skipped: true };

  lastStart = Date.now();
  inFlight = (async () => {
    await setStatus(undefined, { state: 'syncing', startedAt: Date.now(), message: '' });
    const now = Date.now();
    const extras = { grades: typeEnabled(prefs, 'grade'), absence: typeEnabled(prefs, 'absence') };
    const result = await read({ schoolId, weekCount: Math.max(4, prefs.weeks), ...extras }).catch((e: Error) => ({ error: e.message }));
    if ('error' in result) {
      const login = 'login' in result && result.login;
      // Another school year is shown: keep the snapshot as it is and say why nothing is checked.
      if ('paused' in result && result.paused) {
        await setStatus(undefined, { state: 'paused', checkedAt: now, login: false, message: result.error });
        return { ok: false, message: result.error };
      }
      await setStatus(undefined, { state: 'error', checkedAt: now, login: !!login, message: login ? 'Log ind på Lectio for at tjekke for nyt.' : result.error });
      return { ok: false, message: result.error };
    }
    const scope: string | null = scheduleScope(result.context);
    if (!scope) return { ok: false, message: 'Ukendt Lectio-konto' };
    const weeks = result.weeks.filter((w) => !w.error);
    const unread = result.weeks.length - weeks.length;
    const fresh = await updateHistory((h) => {
      const previous = h.accounts[scope] || {};
      const before = new Set((previous.messages || []).map((m) => m.id));
      const value: AccountState = compareAll(previous, { weeks, feeds: result.feeds }, {
        now,
        isOn: (kind: NoticeKind) => typeEnabled(prefs, typeOfKind(kind)),
        digestDue: digestDue(prefs, now),
        home: new URL('forside.aspx', result.context.scheduleHref).href,
      });
      const warnings: string[] = [];
      if (unread) warnings.push(`${unread} ${unread === 1 ? 'uge kunne' : 'uger kunne'} ikke læses.`);
      if (!Array.isArray(result.feeds.lectioMessages)) warnings.push('Beskeder kunne ikke læses.');
      if (!Array.isArray(result.feeds.assignments)) warnings.push('Afleveringer kunne ikke læses.');
      if (result.feeds.grades === null) warnings.push('Karakterer kunne ikke læses.');
      if (result.feeds.absence === null) warnings.push('Fravær kunne ikke læses.');
      const failed = !weeks.length && !Array.isArray(result.feeds.lectioMessages) && !Array.isArray(result.feeds.assignments);
      value.status = failed
        ? { state: 'error', checkedAt: now, message: 'Lectio kunne ikke læses. Prøver igen ved næste tjek.' }
        : { state: 'ok', checkedAt: now, message: warnings.length ? `${warnings.join(' ')} Prøver igen ved næste tjek.` : '' };
      return {
        value: { ...h, current: scope, accounts: { ...h.accounts, [scope]: value } },
        result: (value.messages || []).filter((m) => !before.has(m.id) && !m.read) as Notice[],
      };
    });
    await notify(fresh, prefs, now);
    await updateBadge();
    if (prefs.connected && weeks.length) await syncToGoogle(weeks, now, result.feeds.assignments);
    return { ok: true, new: fresh.length };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// Stilletimer only silence the system notifications; the history keeps everything.
async function notify(notices: Notice[], prefs: SyncPrefs, now: number) {
  if (!prefs.system || !notices.length || !browser.notifications || inQuietHours(prefs, now)) return;
  const icon = browser.runtime.getURL('/icon/128.png' as any);
  if (notices.length > 3) {
    await browser.notifications.create('lx:summary', { type: 'basic', iconUrl: icon, title: `${notices.length} nye ting i Lectio`, message: notices.slice(0, 3).map((n) => noticeTitle(n)).join('\n') });
    return;
  }
  for (const n of notices) {
    await browser.notifications.create(`lx:${n.id}`, { type: 'basic', iconUrl: icon, title: noticeTitle(n), message: noticeBody(n) || 'Lectiomizer' });
  }
}

export async function updateBadge() {
  const history = await loadHistory();
  const account = history.current ? history.accounts[history.current] : undefined;
  const unread = (account?.messages || []).filter((m) => !m.read).length;
  const action = (browser as any).action ?? (browser as any).browserAction;
  await action?.setBadgeText({ text: unread ? String(Math.min(unread, 99)) : '' });
  await action?.setBadgeBackgroundColor?.({ color: '#E0533D' });
}

export async function markRead(ids: string[] | 'all') {
  await updateHistory((h) => {
    if (!h.current) return { result: null };
    const account = h.accounts[h.current] || {};
    const set = ids === 'all' ? null : new Set(ids);
    const messages = (account.messages || []).map((m) => (!set || set.has(m.id) ? { ...m, read: true } : m));
    return { value: { ...h, accounts: { ...h.accounts, [h.current]: { ...account, messages } } }, result: null };
  });
  await updateBadge();
}

/** The notice behind a system notification, for routing a click. */
export async function noticeFor(notificationId: string): Promise<Notice | null> {
  if (!notificationId.startsWith('lx:') || notificationId === 'lx:summary') return null;
  const id = notificationId.slice(3);
  const history = await loadHistory();
  for (const account of Object.values(history.accounts)) {
    const found = account.messages?.find((m) => m.id === id);
    if (found) return found;
  }
  return null;
}

export { HISTORY_KEY };
