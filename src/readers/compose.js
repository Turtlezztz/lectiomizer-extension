// Reads a new message on beskeder2.aspx: Lectio writes it in the thread panel,
// before the thread has any messages. Recipients are added through Lectio's
// own search field (a text box, a hidden id and a hidden "add" button) and
// listed in ThreadRecipientsGV; the subject, body and Send are the same
// writing row a thread has under its last message.
import { text } from '../page-data.js';
import { schoolBase } from '../lectio.js';
import { ReaderError } from './util.js';
import { cardId, personName, readMe, readReply } from './thread.js';

// Lectio's recipient search loads its people, classes and groups from cached
// lists that the page registers in a script, e.g.
// Autocomplete.registerDataSetUrl('bcstudent_1_y2026', '/lectio/94/cache/DropDown.aspx?type=bcstudent&…').
const DATASET = /registerDataSetUrl\(\s*['"](bc[a-z]+)_[^'"]*['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
export function readSources(doc) {
  const sources = new Map();
  for (const script of doc.querySelectorAll('script')) {
    for (const [, kind, url] of (script.textContent || '').matchAll(DATASET)) {
      if (!sources.has(kind)) sources.set(kind, new URL(url.replace(/&amp;/g, '&'), doc.URL).href);
    }
  }
  return Array.from(sources, ([kind, url]) => ({ kind, url }));
}

// Lectio hides its validators with inline styles or its own classes; one that
// shows (or an ancestor up to the panel) is only hidden if the browser says so.
function shown(el, panel) {
  const view = el.ownerDocument.defaultView;
  for (let node = el; node && node !== panel; node = node.parentElement) {
    const style = view?.getComputedStyle ? view.getComputedStyle(node) : node.style;
    if (style.display === 'none' || style.visibility === 'hidden' || node.hidden) return false;
  }
  return true;
}
// The length limits are kept by the fields themselves (and shown beside the subject).
const lengthLimit = /maksimalt være [\d.]+ tegn/i;

export function readCompose(doc, panel) {
  const input = panel.querySelector('input[id$="addRecipientDD_inp"]');
  const id = panel.querySelector('input[id$="addRecipientDD_inpid"]');
  const add = panel.querySelector('a[id$="AddRecipientBtn"]');
  if (!input || !id || !add) throw new ReaderError('Modtagerfeltet blev ikke fundet');
  const row = Array.from(panel.querySelectorAll('[id="GridRowMessage"]')).find(r => r.querySelector('textarea'));
  const form = row && readReply(row);
  if (!form?.title) throw new ReaderError('Beskedformularen blev ikke fundet');
  const recipients = Array.from(panel.querySelectorAll('table[id$="ThreadRecipientsGV"] tr')).flatMap(tr => {
    const cell = tr.querySelector('td');
    if (!cell || tr.querySelector('.noRecord')) return [];
    const card = tr.querySelector('[data-lectiocontextcard]');
    const full = text(card || cell);
    const remove = Array.from(tr.querySelectorAll('a')).find(a => /__doPostBack/.test(a.getAttribute('onclick') || a.getAttribute('href') || '')) || null;
    return full ? [{ id: cardId(card), full, name: personName(full), remove }] : [];
  });
  const noReply = panel.querySelector('input[type="checkbox"][id*="Replies"]');
  const school = schoolBase(doc.URL);
  return {
    me: readMe(doc),
    recipients,
    search: { input, id, add },
    sources: readSources(doc),
    subject: form.title, body: form.body, send: form.send, cancel: form.cancel, attach: form.attach, files: form.files,
    noReply: noReply && {
      input: noReply,
      label: text(noReply.id && panel.querySelector(`label[for="${noReply.id}"]`)) || noReply.closest('[title]')?.getAttribute('title') || 'Skal ikke kunne besvares',
    },
    // Lectio's validators show their message once a check fails.
    errors: Array.from(panel.querySelectorAll('.alert')).filter(el => !el.querySelector('.alert') && text(el) && !lengthLimit.test(text(el)) && shown(el, panel)).map(el => text(el)),
    back: doc.URL,
    base: school ? new URL(school, doc.URL).href : null,
  };
}
