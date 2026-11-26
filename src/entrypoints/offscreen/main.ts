// Chrome only: the background service worker has no DOMParser, so it asks this
// offscreen document to fetch and parse Lectio pages.
import { NotLoggedInError } from '@/lib/lectio/client';
import { readLectio } from '@/lib/sync/read';
import { browser } from 'wxt/browser';

browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message?.target !== 'offscreen' || message.type !== 'read') return;
  readLectio({ schoolId: message.schoolId, weekCount: message.weekCount })
    .then(sendResponse)
    .catch((error: Error) => sendResponse({ error: error.message, login: error instanceof NotLoggedInError }));
  return true;
});
