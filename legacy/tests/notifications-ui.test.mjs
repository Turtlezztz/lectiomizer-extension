import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { fixture } from '../demo/fixtures.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const opened = new Set();
after(() => { for (const dom of opened) dom.window.close(); });
const lesson = { id: 'absid:1', holds: ['3a Da'], title: '', rooms: ['A14'], teachers: [], start: '2026-10-06T08:15', end: '2026-10-06T09:45', href: 'https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=1' };
const messages = [
  { id: 'changed', kind: 'changed', lesson, before: { ...lesson, rooms: ['A12'] }, createdAt: Date.now(), read: false },
  { id: 'message', kind: 'message', item: { title: 'Ekskursion', description: 'Lene Madsen', href: 'https://www.lectio.dk/lectio/123/beskeder2.aspx?type=visbesked&id=1' }, createdAt: Date.now(), read: false },
  { id: 'assignment', kind: 'assignment', item: { title: 'Rapport', description: '3a Fy · Frist: 12/10', href: 'https://www.lectio.dk/lectio/123/ElevAflevering.aspx?exerciseid=1' }, createdAt: Date.now(), read: true },
];
async function mount({ mobile = false, failRead = false, data = messages, publicPage = false } = {}) {
  const dom = new JSDOM(fixture('/lectio/123/SkemaNy.aspx', false), { url: 'https://www.lectio.dk/lectio/123/SkemaNy.aspx', runScripts: 'outside-only', pretendToBeVisual: true });
  opened.add(dom);
  const { window } = dom;
  if (publicPage) for (const link of window.document.querySelectorAll('a[href$="logout.aspx"]')) link.remove();
  const listeners = new Set();
  const store = { scheduleHistory: { accounts: { '123:S9': { messages: structuredClone(data), status: { checkedAt: Date.now(), state: 'ok' } } } } };
  const set = async patch => {
    Object.assign(store, structuredClone(patch));
    for (const fn of listeners) fn(Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, { newValue: structuredClone(value) }])), 'local');
  };
  window.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
  window.browser = {
    storage: { local: { get: async key => ({ [key]: structuredClone(store[key]) }), set }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } },
    runtime: { onMessage: { addListener() {}, removeListener() {} }, sendMessage: async message => {
      if (message.type === 'schedule:claim') return { started: false, busy: true };
      if (message.type !== 'schedule:read' || failRead) return { ok: false };
      const ids = new Set(message.ids);
      const history = structuredClone(store.scheduleHistory);
      history.accounts['123:S9'].messages = history.accounts['123:S9'].messages.map(item => ids.has(item.id) ? { ...item, read: true } : item);
      await set({ scheduleHistory: history });
      return { ok: true };
    } },
  };
  window.eval(await readFile('dist/content.js', 'utf8'));
  for (let tries = 0; tries < 100 && !window.document.querySelector(publicPage ? '.lx-topbar' : '.lx-notifications-bell'); tries++) await delay(10);
  await delay(20);
  return { dom, doc: window.document, store, set };
}
async function close(dom) { dom.window.dispatchEvent(new dom.window.Event('pagehide')); await delay(10); dom.window.close(); opened.delete(dom); }

test('the bell shows shared history, before/after values, and persisted read markers', async () => {
  const { dom, doc, store } = await mount();
  const bell = doc.querySelector('.lx-notifications-bell');
  assert.match(bell.getAttribute('aria-label'), /2 ulæste/);
  bell.click(); await delay(20);
  assert.equal(doc.querySelectorAll('.lx-notification').length, 3);
  assert.match(doc.querySelector('.lx-notification-detail').textContent, /Lokale: A12 → A14/);
  assert.match(doc.querySelector('.lx-notifications-note').textContent, /uden Google/);
  doc.querySelector('.lx-notifications-tools button').click(); await delay(20);
  assert.equal(store.scheduleHistory.accounts['123:S9'].messages.every(message => message.read), true);
  assert.equal(bell.getAttribute('aria-label'), 'Notifikationer');
  assert.equal(doc.querySelector('.lx-notifications-tools button').disabled, true);
  doc.querySelector('[aria-label="Luk notifikationer"]').click(); await delay(10);
  assert.equal(doc.activeElement, bell);
  assert.equal(doc.querySelector('.lx-notifications-panel'), null);
  bell.click(); await delay(10);
  assert.equal(doc.querySelectorAll('.lx-notification-unread').length, 0);
  await close(dom);
});

test('new notifications announce a toast, open the centre, and preserve unseen notifications when reading one', async () => {
  const { dom, doc, store, set } = await mount({ mobile: true });
  assert.equal(doc.querySelector('.lx-notification-toast'), null);
  const history = structuredClone(store.scheduleHistory);
  history.accounts['123:S9'].messages.unshift({ ...messages[0], id: 'cancelled', kind: 'cancelled', read: false });
  await set({ scheduleHistory: history }); await delay(20);
  assert.match(doc.querySelector('.lx-notification-toast [role="status"]').textContent, /er aflyst/);
  doc.querySelector('.lx-notification-toast-actions button').click(); await delay(20);
  assert.ok(doc.querySelector('.lx-notifications-panel'));
  assert.equal(doc.querySelector('.lx-notification-toast'), null);
  assert.equal(doc.activeElement, doc.querySelector('#lx-notifications-title'));
  doc.querySelector('.lx-notification-read').click(); await delay(20);
  assert.equal(store.scheduleHistory.accounts['123:S9'].messages.find(message => message.id === 'cancelled').read, true);
  assert.match(doc.querySelector('.lx-notifications-bell').getAttribute('aria-label'), /2 ulæste/);
  doc.querySelector('.lx-notification-read').focus();
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await delay(20);
  assert.equal(doc.querySelector('.lx-notifications-panel'), null);
  assert.equal(doc.activeElement, doc.querySelector('.lx-notifications-bell'));
  await close(dom);
});

test('storage for another student does not enter this history; read errors keep unread markers', async () => {
  const { dom, doc, store, set } = await mount({ failRead: true });
  const history = structuredClone(store.scheduleHistory);
  history.accounts['123:S10'] = { messages: [{ ...messages[1], id: 'someone-else' }] };
  await set({ scheduleHistory: history }); await delay(20);
  assert.equal(doc.querySelector('.lx-notification-toast'), null);
  doc.querySelector('.lx-notifications-bell').click(); await delay(10);
  doc.querySelector('.lx-notifications-tools button').click(); await delay(20);
  assert.match(doc.querySelector('.lx-notifications-error').textContent, /kunne ikke markeres/);
  assert.equal(doc.querySelectorAll('.lx-notification-unread').length, 2);
  await close(dom);
});

test('empty history explains the baseline and unsafe links render as plain text', async () => {
  const empty = await mount({ data: [] });
  empty.doc.querySelector('.lx-notifications-bell').click(); await delay(10);
  assert.match(empty.doc.querySelector('.lx-notifications-empty').textContent, /Nye beskeder, afleveringer og skemaændringer/);
  await close(empty.dom);
  const unsafe = await mount({ data: [{ ...messages[1], item: { title: '<script>not code</script>', href: 'https://evil.example/' } }] });
  unsafe.doc.querySelector('.lx-notifications-bell').click(); await delay(10);
  assert.equal(unsafe.doc.querySelector('.lx-notification a'), null);
  assert.match(unsafe.doc.querySelector('.lx-notification-title').textContent, /<script>/);
  assert.equal(unsafe.doc.querySelector('.lx-notification script'), null);
  await close(unsafe.dom);
});

test('logged-out pages retain the shell without a notification account', async () => {
  const { dom, doc } = await mount({ publicPage: true });
  assert.ok(doc.querySelector('.lx-topbar'));
  assert.ok(doc.querySelector('.lx-sidebar'));
  assert.equal(doc.querySelector('.lx-notifications-bell'), null);
  await close(dom);
});
