// Background: opens the app tab, closes the Lectio login tab once signed in,
// and runs the periodic Lectio check (notifications + Google Calendar).
import { appRoute } from '@/lib/lectio/paths';
import { NotLoggedInError } from '@/lib/lectio/client';
import { readLectio } from '@/lib/sync/read';
import { markRead, noticeFor, runCheck, updateBadge, type Reader } from '@/lib/sync/check';
import { connectGoogle, disconnectGoogle, syncToGoogle } from '@/lib/sync/calendar';
import { intervalOf, loadPrefs, SYNC_KEY } from '@/lib/sync/store';

const APP_PATH = '/app.html';
const ALARM = 'lectio-check';
const loginTabs = new Set<number>();

async function openApp(route = '') {
  const url = browser.runtime.getURL(APP_PATH as any);
  const target = route ? `${url}#${route}` : url;
  const [existing] = await browser.tabs.query({ url: `${url}*` });
  if (existing?.id != null) {
    await browser.tabs.update(existing.id, { active: true, ...(route ? { url: target } : {}) });
    if (existing.windowId != null) await browser.windows.update(existing.windowId, { focused: true });
    return existing;
  }
  return browser.tabs.create({ url: target });
}

// ---------------------------------------------------------------- reading
// Readers need DOMParser. Firefox's background page has one; Chrome's service
// worker doesn't, so there we parse in an offscreen document.
const direct: Reader = async (args) => {
  try {
    return await readLectio(args);
  } catch (error) {
    return { error: (error as Error).message, login: error instanceof NotLoggedInError };
  }
};

let creating: Promise<void> | null = null;
async function ensureOffscreen() {
  const offscreen = (globalThis as any).chrome?.offscreen;
  if (await offscreen.hasDocument?.()) return;
  creating ??= offscreen
    .createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'Læser Lectio-sider for at finde nye beskeder og skemaændringer.' })
    .catch((e: Error) => {
      if (!/single offscreen/i.test(e.message)) throw e;
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}
const viaOffscreen: Reader = async (args) => {
  await ensureOffscreen();
  return browser.runtime.sendMessage({ target: 'offscreen', type: 'read', ...args });
};
const read: Reader = typeof DOMParser !== 'undefined' ? direct : viaOffscreen;

async function scheduleAlarm() {
  const prefs = await loadPrefs();
  const period = intervalOf(prefs).minutes;
  const existing = await browser.alarms.get(ALARM);
  if (existing?.periodInMinutes === period) return;
  await browser.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: period });
}

export default defineBackground(() => {
  browser.action?.onClicked.addListener(() => {
    openApp();
  });
  (browser as any).browserAction?.onClicked.addListener(() => openApp());

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') openApp();
    scheduleAlarm();
  });
  browser.runtime.onStartup.addListener(() => {
    scheduleAlarm();
    updateBadge();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) runCheck(read).catch((e) => console.warn('Lectiomizer: tjek fejlede', e));
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SYNC_KEY]) scheduleAlarm();
    // A school was just chosen (or changed): check right away.
    if (changes.settings && (changes.settings.newValue as any)?.school?.id !== (changes.settings.oldValue as any)?.school?.id) runCheck(read, { force: true });
  });

  // sendResponse + `return true` works in both Chrome and Firefox.
  browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (message?.target === 'offscreen') return; // meant for the offscreen document
    if (sender.id !== browser.runtime.id || sender.tab?.url?.startsWith('http')) return;
    const reply = (p: Promise<unknown>) => {
      p.then(sendResponse, (e: Error) => sendResponse({ ok: false, message: e.message }));
      return true;
    };
    switch (message?.type) {
      case 'open-login':
        browser.tabs.create({ url: message.url }).then((tab) => tab.id != null && loginTabs.add(tab.id));
        return;
      case 'check-now':
        return reply(runCheck(read, { force: true }));
      case 'check-if-due':
        return reply(runCheck(read));
      case 'mark-read':
        return reply(markRead(message.ids));
      case 'calendar:connect':
        return reply(connectGoogle().then(async (r) => (r.ok ? (runCheck(read, { force: true }), r) : r)));
      case 'calendar:disconnect':
        return reply(disconnectGoogle());
      case 'calendar:sync-now':
        return reply(
          read({ schoolId: message.schoolId, weekCount: 8 }).then((r) => ('error' in r ? { ok: false, message: r.error } : syncToGoogle(r.weeks))),
        );
    }
  });

  browser.notifications?.onClicked.addListener(async (id) => {
    const notice = await noticeFor(id);
    const route = notice ? appRoute(notice.item?.href || notice.lesson?.href) : null;
    if (notice) await markRead([notice.id]);
    await openApp(route || (id === 'lx:summary' ? '/?notifications=1' : ''));
    browser.notifications.clear(id);
  });

  // After login Lectio lands on the student's forside; that's our cue.
  browser.tabs.onUpdated.addListener(async (tabId, info) => {
    if (!loginTabs.has(tabId) || !info.url) return;
    if (/^https:\/\/(www\.)?lectio\.dk\/lectio\/\d+\/forside\.aspx/i.test(info.url)) {
      loginTabs.delete(tabId);
      await openApp();
      browser.tabs.remove(tabId).catch(() => {});
      runCheck(read, { force: true });
    }
  });
  browser.tabs.onRemoved.addListener((tabId) => loginTabs.delete(tabId));

  scheduleAlarm();
});
