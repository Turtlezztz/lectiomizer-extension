// Chrome only: the background service worker has no DOMParser, so it asks this
// offscreen document to fetch and parse Lectio pages (background checks and
// tool calls from the MCP bridge).
import { NotLoggedInError } from '@/lib/lectio/client';
import { readLectio } from '@/lib/sync/read';
import { PastTermError } from '@/lib/lectio/term';
import { runToolHere } from '@/lib/agent/run-tool';
import { browser } from 'wxt/browser';

browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  if (message.type === 'read') {
    readLectio({ schoolId: message.schoolId, weekCount: message.weekCount })
      .then(sendResponse)
      .catch((error: Error) => sendResponse({ error: error.message, login: error instanceof NotLoggedInError, paused: error instanceof PastTermError }));
    return true;
  }
  if (message.type === 'tool') {
    runToolHere(message.name, message.args || {})
      .then(sendResponse)
      .catch((error: Error) => sendResponse({ ok: false, text: `Fejl: ${error.message}`, label: 'Fejl' }));
    return true;
  }
});
