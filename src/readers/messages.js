// Reads beskeder2.aspx: the folders, and the message list, an open thread
// (thread.js) or a new message (compose.js), which Lectio renders in its place.
import { text } from '../page-data.js';
import { ReaderError, headerRow, nativeCells } from './util.js';
import { readThread } from './thread.js';
import { readCompose } from './compose.js';

function readFolders(tree, current) {
  const hidden = el => el.hidden || /display:\s*none/.test(el.getAttribute('style') || '');
  const walk = (container, depth) => Array.from(container.children).flatMap(el => {
    if (el.classList.contains('TreeNode-container') || hidden(el)) return [];
    if (!el.hasAttribute('lec-node-id')) return walk(el, depth);
    const link = el.querySelector(':scope > .TreeNode-container a.TreeNode');
    const chevron = el.querySelector(':scope > .TreeNode-container .TreeNode-chevron');
    const id = el.getAttribute('lec-node-id');
    const children = walk(el, depth + 1);
    const expandable = !!chevron && !/dummy/.test(chevron.getAttribute('src') || '');
    return [{
      id, depth, label: text(link?.querySelector('.TreeNode-title') || link), title: link?.querySelector('.TreeNode-title')?.getAttribute('title') || '',
      source: link, toggle: expandable ? chevron : null, open: expandable && children.length > 0, current: id === current,
    }, ...children];
  });
  return tree ? walk(tree, 0) : [];
}

export function readMessages(doc) {
  const current = new URL(doc.location?.href || doc.URL).searchParams.get('mappeid');
  const folders = () => readFolders(doc.querySelector('[id$="ListGridSelectionTree"]'), current);
  const open = doc.querySelector('[id$="ViewThreadPagePanel"]');
  // A new message is the thread panel before anything has been sent in it.
  if (open) return { folders: folders(), ...(open.querySelector('.message-thread-message-sender') ? { thread: readThread(doc, open) } : { compose: readCompose(doc, open) }) };
  const panel = doc.querySelector('[id$="ThreadListPanel"]');
  const table = panel?.querySelector('table[id$="threadGV_ctl00"]') || panel?.querySelector('table.lf-grid');
  if (!panel || !table) throw new ReaderError('Beskedlisten blev ikke fundet');
  const head = headerRow(table);
  const labels = head ? nativeCells(head).map(cell => text(cell)) : [];
  const col = (cells, name) => cells[labels.indexOf(name)];
  const search = panel.querySelector('[id$="SPSearchText_tb"]');
  return {
    folder: text(panel.querySelector('[id$="MessageFolderLabel"]')),
    folders: folders(),
    actions: {
      compose: panel.querySelector('[id$="NewMessageLnk"]'),
      markAllRead: panel.querySelector('[id$="MarkReadButton"]'),
      toggleDeleted: panel.querySelector('[id$="ShowHiddenMessages"] a'),
      bulk: panel.querySelector('[id$="MarkChkDD"]'),
      search, searchButton: panel.querySelector('[id$="SPSearchBtn"]'),
    },
    bulkOptions: Array.from(panel.querySelectorAll('[id$="MarkChkDD"] option')).filter(o => o.value !== '-1').map(o => ({ value: o.value, label: text(o) })),
    searchValue: search?.value || '',
    messages: Array.from(table.rows).filter(row => row !== head && row.querySelector(':scope>td')).map(row => {
      const cells = nativeCells(row);
      const sender = col(cells, 'Seneste besked')?.querySelector('span') || col(cells, 'Seneste besked');
      const first = col(cells, 'Første besked')?.querySelector('span') || col(cells, 'Første besked');
      const recipients = col(cells, 'Modtagere')?.querySelector('span');
      const flag = row.querySelector('img[id$="_flagId"]');
      return {
        subject: text(row.querySelector('a[id$="_ch"]') || col(cells, 'Emne')),
        open: row.querySelector('a[id$="_ch"]'),
        sender: text(sender), senderTitle: sender?.getAttribute?.('title') || '',
        starter: text(first), recipients: text(recipients), recipientsTitle: recipients?.getAttribute('title') || '',
        changed: text(col(cells, 'Ændret')),
        unread: row.classList.contains('unread'),
        flagged: /flagon/.test(flag?.getAttribute('src') || ''),
        attachment: Array.from(row.querySelectorAll('.ls-fonticon')).some(icon => text(icon) === 'attach_file'),
        select: row.querySelector('input[type=checkbox][id$="_threadCB"]'),
        flag, read: row.querySelector('img[id$="_readId"]'), hide: row.querySelector('img[id$="_hiddenId"]'),
      };
    }),
  };
}
