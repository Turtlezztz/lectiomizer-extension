// Background: opens the app tab, closes the Lectio login tab once signed in,
// and runs the periodic Lectio check (notifications + Google Calendar).
import { appRoute } from '@/lib/lectio/paths';
import { NotLoggedInError } from '@/lib/lectio/client';
import { readLectio } from '@/lib/sync/read';
import { PastTermError } from '@/lib/lectio/term';
import { markRead, noticeFor, runCheck, updateBadge, type Reader } from '@/lib/sync/check';
import { connectGoogle, disconnectGoogle, syncToGoogle } from '@/lib/sync/calendar';
import { intervalOf, loadPrefs, SYNC_KEY } from '@/lib/sync/store';
import { cancelSignIn, onTabRemoved, onTabUpdated, pasteCallback, refreshModels, signOut, signedOut, startSignIn, tokenForApp } from '@/lib/agent/session';
import { BRIDGE_KEY, loadBridge, startBridge, type BridgeRunner } from '@/lib/agent/bridge';
import { runToolHere } from '@/lib/agent/run-tool';

const APP_PATH = '/app.html';
const ALARM = 'lectio-check';
const BRIDGE_ALARM = 'mcp-bridge';
const loginTabs = new Set<number>();

async function openApp(route = '', { check = false } = {}) {
  const url = browser.runtime.getURL(APP_PATH as any);
  const target = route ? `${url}#${route}` : url;
  const [existing] = await browser.tabs.query({ url: `${url}*` });
  if (existing?.id != null) {
    await browser.tabs.update(existing.id, { active: true, ...(route ? { url: target } : {}) });
    if (existing.windowId != null) await browser.windows.update(existing.windowId, { focused: true });
    if (check) runCheck(read, { onOpen: true }).catch((e) => console.warn('Lectiomizer: tjek fejlede', e));
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
    return { error: (error as Error).message, login: error instanceof NotLoggedInError, paused: error instanceof PastTermError };
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

// MCP bridge: tool calls from a local MCP client, run with the Lectio session.
const runTool: BridgeRunner =
  typeof DOMParser !== 'undefined'
    ? (call) => runToolHere(call.name, call.arguments)
    : async (call) => {
        await ensureOffscreen();
        return browser.runtime.sendMessage({ target: 'offscreen', type: 'tool', name: call.name, args: call.arguments });
      };
async function bridge() {
  const { enabled } = await loadBridge();
  // While it's on, a once-a-minute alarm finds a server that starts later.
  if (enabled) {
    if (!(await browser.alarms.get(BRIDGE_ALARM))) await browser.alarms.create(BRIDGE_ALARM, { periodInMinutes: 1 });
  } else await browser.alarms.clear(BRIDGE_ALARM);
  await startBridge(runTool).catch((e) => console.warn('Lectiomizer: MCP-bro fejlede', e));
}

async function scheduleAlarm() {
  const prefs = await loadPrefs();
  const period = intervalOf(prefs).minutes;
  const existing = await browser.alarms.get(ALARM);
  if (existing?.periodInMinutes === period) return;
  await browser.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: period });
}

export default defineBackground(() => {
  browser.action?.onClicked.addListener(() => {
    openApp('', { check: true });
  });
  (browser as any).browserAction?.onClicked.addListener(() => openApp('', { check: true }));

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') openApp();
    scheduleAlarm();
  });
  browser.runtime.onStartup.addListener(() => {
    bridge();
    scheduleAlarm();
    updateBadge();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) runCheck(read).catch((e) => console.warn('Lectiomizer: tjek fejlede', e));
    if (alarm.name === BRIDGE_ALARM) bridge();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SYNC_KEY]) scheduleAlarm();
    if (changes[BRIDGE_KEY]) bridge();
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
      case 'check-on-open':
      case 'check-if-due':
        return reply(runCheck(read, { onOpen: true }));
      case 'mark-read':
        return reply(markRead(message.ids));
      case 'calendar:connect':
        return reply(connectGoogle().then(async (r) => (r.ok ? (runCheck(read, { force: true }), r) : r)));
      case 'calendar:disconnect':
        return reply(disconnectGoogle());
      // Assistent (Sign in with ChatGPT). Only the background refreshes tokens.
      case 'chat:connect':
        return reply(startSignIn({ openerTabId: sender.tab?.id ?? null, consent: !!message.consent }));
      case 'chat:cancel':
        return reply(cancelSignIn());
      case 'chat:callback':
        return reply(pasteCallback(message.url));
      case 'chat:disconnect':
        return reply(signOut());
      case 'chat:models':
        return reply(refreshModels());
      case 'chat:token':
        return reply(tokenForApp(!!message.force));
      case 'chat:signed-out':
        return reply(signedOut(String(message.message || 'Log ind med ChatGPT igen.')));
      case 'mcp:start':
        bridge();
        return reply(Promise.resolve({ ok: true }));
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
    onTabUpdated(tabId, info).catch(() => {});
    if (!loginTabs.has(tabId) || !info.url) return;
    if (/^https:\/\/(www\.)?lectio\.dk\/lectio\/\d+\/forside\.aspx/i.test(info.url)) {
      loginTabs.delete(tabId);
      await openApp();
      browser.tabs.remove(tabId).catch(() => {});
      runCheck(read, { force: true });
    }
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    loginTabs.delete(tabId);
    onTabRemoved(tabId).catch(() => {});
  });

  scheduleAlarm();
  bridge();
});
