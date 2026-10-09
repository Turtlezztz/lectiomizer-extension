// Reads an open message thread on beskeder2.aspx: who is in it, every message
// with its sender, and Lectio's own reply form at the bottom. Editing a message
// or the thread, and writing a new thread, stay on Lectio's own page.
import { text } from '../page-data.js';
import { fullPhoto, schoolBase } from '../lectio.js';
import { ReaderError, iconLabel } from './util.js';

// "Jonathan Hansen(k) (1x 17)" → "Jonathan Hansen", "Lene Madsen (lm)" → "Lene Madsen"
export function personName(value = '') {
  let name = value.trim();
  for (let previous; previous !== name;) { previous = name; name = name.replace(/\s*\([^()]*\)$/, ''); }
  return name || value.trim();
}

// "05-03-2026 14:33:09" → Date (local time)
export function parseStamp(value) {
  const m = (value || '').match(/(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) : null;
}

export const cardId = el => (el?.getAttribute('data-lectiocontextcard') || '').trim();
const person = el => ({ id: cardId(el), full: text(el), name: personName(text(el)) });

// Lectio's "more" menus: [{label, icon, source}] from the hidden context menu.
function menuItems(root) {
  return Array.from(root?.querySelectorAll('.lec-context-menu li a') || []).map(source => ({
    label: iconLabel(source), icon: text(source.querySelector('.ls-fonticon')), source,
  })).filter(item => item.label);
}

// The signed-in student: the header photo links to their user id ("U…"), the
// title carries their student id ("S…") and name.
export function readMe(doc) {
  const photo = doc.querySelector('[id$="picctrlthumbimage"]');
  const title = doc.querySelector('[id$="MainTitle"]');
  const user = (photo?.getAttribute('onclick') || '').match(/usrid=(\d+)/)?.[1];
  const student = doc.querySelector('meta[name="msapplication-starturl"]')?.getAttribute('content')?.match(/elevid=(\d+)/)?.[1];
  const heading = text(title) || doc.title;
  const name = heading.match(/^(?:Eleven|Læreren)\s+(.+?)(?:,|\s+-)/)?.[1] || '';
  let src = null;
  try {
    const url = new URL(photo?.getAttribute('src') || '', doc.URL);
    if (photo?.getAttribute('src') && url.origin === new URL(doc.URL).origin && !/defaultfoto/i.test(url.pathname)) src = fullPhoto(url.href);
  } catch {}
  return { ids: [user && `U${user}`, student && `S${student}`, cardId(title)].filter(Boolean), name: personName(name), photo: src };
}

// Files sent with a message: inline attachment blocks, Lectio's document links,
// and links under the message.
function readAttachments(row, content) {
  const links = [
    ...content.querySelectorAll('.message-attachements a[href], .message-attachments a[href], a[href*="dokumenthent.aspx"], a[href*="GetFile.aspx"]'),
    ...row.querySelectorAll('.message-buttons-options-container a[href]'),
  ];
  const seen = new Set();
  return links.flatMap(link => {
    const raw = link.getAttribute('href') || '';
    const name = text(link);
    if (!name || !raw || raw.startsWith('#') || /^javascript:/i.test(raw) || link.closest('.lec-context-menu')) return [];
    const href = link.href;
    if (seen.has(href)) return [];
    seen.add(href);
    const size = text(link.parentElement).match(/\((\d+(?:[.,]\d+)?\s*[KMG]?B)\)/i)?.[1] || '';
    return [{ name, href, size }];
  });
}

const block = /^(P|DIV|UL|OL|TABLE|BLOCKQUOTE|PRE|HR|H[1-6])$/;

// A copy of the message text without attachments and without the whitespace
// Lectio's template puts around it. Plain-text messages keep their line breaks.
function readContent(node) {
  const content = node.cloneNode(true);
  content.querySelectorAll('.message-attachements, .message-attachments').forEach(el => el.remove());
  content.querySelectorAll('a[href*="dokumenthent.aspx"], a[href*="GetFile.aspx"]').forEach(el => el.remove());
  const doc = content.ownerDocument;
  const walker = doc.createTreeWalker(content, 4);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    if (/\S/.test(node.data)) continue;
    const edge = node.parentNode === content && (!node.previousSibling || !node.nextSibling);
    if (edge || [node.previousSibling, node.nextSibling].some(sibling => sibling && block.test(sibling.nodeName))) node.remove();
  }
  const words = texts.filter(node => node.parentNode && /\S/.test(node.data));
  if (words.length) { words[0].data = words[0].data.replace(/^\s+/, ''); words.at(-1).data = words.at(-1).data.replace(/\s+$/, ''); }
  if (!content.querySelector('br') && !Array.from(content.querySelectorAll('*')).some(el => block.test(el.nodeName))) {
    for (const node of words) {
      const lines = node.data.split(/\r?\n/);
      if (lines.length < 2) continue;
      node.replaceWith(...lines.flatMap((line, i) => i ? [doc.createElement('br'), line.trim()] : [line.trim()]));
    }
  }
  return content;
}

// Files attached to a message being written: Lectio lists them in an
// AttachmentsGV table, each with a link to the file and one that removes it.
function readFiles(root) {
  return Array.from(root.querySelectorAll('table[id*="AttachmentsGV"] tr')).flatMap(row => {
    const links = Array.from(row.querySelectorAll('a'));
    const remove = links.find(a => /AttachmentsGV/.test(a.getAttribute('onclick') || a.getAttribute('href') || '')) || null;
    const link = links.find(a => a !== remove && !/^(#|javascript:)/i.test(a.getAttribute('href') || ''));
    const name = text(link) || text(row.querySelector('td'));
    return name ? [{ name, href: link?.href || null, remove }] : [];
  });
}

// The writing row Lectio keeps under the last message (and alone in a new
// thread): a title, a BBCode body, "Vedhæft fil", "Send" and "Annuller".
export function readReply(row) {
  const body = row.querySelector('textarea');
  const send = row.querySelector('a[id$="SendMessageBtn"]');
  if (!body || !send) return null;
  return {
    body, send,
    title: row.querySelector('input[id*="EditModeHeaderTitleTB"]'),
    cancel: row.querySelector('a[id$="BackMessageBtn"]'),
    attach: row.querySelector('a[id$="choosedocBtn"]'),
    files: readFiles(row),
  };
}

export function readThread(doc, panel) {
  const table = panel.querySelector('table[id$="MessagesGV"]');
  if (!table) throw new ReaderError('Beskedtråden blev ikke fundet');
  const header = panel.querySelector('.thread-header-container');
  // Recipients become fields while the thread is edited; Lectio's page does that.
  if (header?.querySelector('input:not([type="hidden"]), textarea, select')) throw new ReaderError('Tråden redigeres');
  const me = readMe(doc);
  const mine = sender => (!!sender.id && me.ids.includes(sender.id)) || (!!me.name && sender.name === me.name);
  let reply = null;
  const messages = [];
  for (const row of table.querySelectorAll('[id="GridRowMessage"]')) {
    const from = row.querySelector('.message-thread-message-sender');
    const editing = row.querySelector('textarea, input[type="text"]');
    if (!from) { if (editing) reply = readReply(row); continue; }
    if (editing) throw new ReaderError('En besked redigeres');
    const sender = person(from.querySelector('[data-lectiocontextcard]') || from.querySelector('span') || from);
    const stamp = text(from).match(/\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?/)?.[0] || '';
    const node = row.querySelector('.message-thread-message-content');
    messages.push({
      sender, own: mine(sender), date: parseStamp(stamp), stamp,
      title: text(row.querySelector('.message-thread-message-header')),
      content: node ? readContent(node) : null,
      attachments: node ? readAttachments(row, node) : [],
      actions: menuItems(row.querySelector('.message-menu')),
    });
  }
  if (!messages.length) throw new ReaderError('Tråden har ingen beskeder');
  const recipients = Array.from(panel.querySelectorAll('[id$="RecipientsReadMode"] [data-lectiocontextcard]')).map(el => {
    const recipient = person(el);
    return { ...recipient, own: mine(recipient) };
  });
  const buttons = panel.querySelector('.thread-header-buttons');
  const flag = buttons?.querySelector('a[id*="FlagThread"]');
  const flagIcon = flag?.querySelector('.ls-fonticon');
  const school = schoolBase(doc.URL);
  return {
    subject: messages[0].title || 'Besked',
    me, recipients, messages, reply,
    // Lectio puts the folder's list address in the URL while a thread is open.
    back: doc.URL,
    base: school ? new URL(school, doc.URL).href : null,
    recipientsText: text(panel.querySelector('[id$="RecipientsReadMode"]')),
    actions: {
      reply: buttons?.querySelector('a[id$="ReplyThreadBtn"]') || null,
      flag: flag || null,
      flagged: /md-fill|ls-fill-fonticon/.test(flagIcon?.className || ''),
      menu: menuItems(buttons),
    },
  };
}
