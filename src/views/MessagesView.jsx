import React, { useState } from 'react';
import { ArrowUpRight, ChevronRight, Flag, Folder, MailCheck, Paperclip, Plus, Search, Trash2 } from 'lucide-react';
import { Action, Empty } from './shared.jsx';
import { ThreadView } from './ThreadView.jsx';
import { ComposeView } from './ComposeView.jsx';

function Folders({ folders }) {
  return <nav className="lx-folders" aria-label="Mapper">
    <ul>{folders.map(f => <li key={f.id} style={{ '--lx-depth': f.depth }} className={f.current ? 'lx-folder lx-folder-current' : 'lx-folder'}>
      {f.toggle ? <button type="button" className={f.open ? 'lx-folder-toggle lx-open' : 'lx-folder-toggle'} aria-label={`${f.open ? 'Skjul' : 'Vis'} ${f.label}`} aria-expanded={f.open} onClick={() => f.toggle.click()}><ChevronRight size={14} aria-hidden="true" /></button> : <span className="lx-folder-toggle" />}
      <Action source={f.source} className="lx-folder-link" title={f.title}><Folder size={16} aria-hidden="true" /><span>{f.label}</span></Action>
    </li>)}</ul>
  </nav>;
}

function MessageRow({ message, selected, onSelect }) {
  return <li className={`lx-message${message.unread ? ' lx-unread' : ''}${selected ? ' lx-selected' : ''}`}>
    {message.select && <input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} aria-label={`Vælg ${message.subject}`} />}
    <span className="lx-unread-dot" aria-label={message.unread ? 'Ulæst' : undefined} />
    <Action source={message.open} className="lx-message-subject">{message.subject}{message.attachment && <Paperclip size={14} aria-label="Vedhæftet fil" />}</Action>
    <span className="lx-message-sender" title={message.senderTitle}>{message.sender}</span>
    <span className="lx-message-date">{message.changed}</span>
    {message.flag && <Action source={message.flag} className={message.flagged ? 'lx-flag lx-flagged' : 'lx-flag'} title={message.flagged ? 'Fjern flag' : 'Tilføj flag'}><Flag size={15} aria-hidden="true" /></Action>}
  </li>;
}

// The folders stay on the left; the list, the open thread or a new message fills the rest.
export function MessagesView({ data, showOriginal }) {
  return <div className={`lx-messages${data.thread || data.compose ? ' lx-messages-thread' : ''}`}>
    <Folders folders={data.folders} />
    {data.thread ? <ThreadView thread={data.thread} showOriginal={showOriginal} />
      : data.compose ? <ComposeView compose={data.compose} showOriginal={showOriginal} />
      : <MessageList data={data} showOriginal={showOriginal} />}
  </div>;
}

function MessageList({ data, showOriginal }) {
  const { actions } = data;
  const [query, setQuery] = useState(data.searchValue);
  const [selected, setSelected] = useState(() => new Set(data.messages.filter(m => m.select?.checked).map(m => m.select.id)));
  const q = query.trim().toLocaleLowerCase('da');
  const visible = data.messages.filter(m => !q || [m.subject, m.sender, m.starter].join(' ').toLocaleLowerCase('da').includes(q));
  const select = (message, value) => {
    message.select.checked = value;
    setSelected(prev => { const next = new Set(prev); value ? next.add(message.select.id) : next.delete(message.select.id); return next; });
  };
  const bulk = value => {
    if (!actions.bulk || !value) return;
    actions.bulk.value = value;
    actions.bulk.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const runSearch = event => {
    event.preventDefault();
    if (!actions.search || !actions.searchButton) return;
    actions.search.value = query;
    actions.searchButton.click();
  };
  const unread = data.messages.filter(m => m.unread).length;
  return <div className="lx-messages-main">
    <div className="lx-messages-head">
      <h2>{data.folder || 'Beskeder'}{unread > 0 && <span className="lx-count">{unread} ulæste</span>}</h2>
      <div className="lx-button-row">
        {actions.compose && <Action source={actions.compose} className="lx-primary-button"><Plus size={16} aria-hidden="true" /> Ny besked</Action>}
        {actions.markAllRead && <Action source={actions.markAllRead} className="lx-chip-button" title="Markér alle ulæste beskeder i mappen som læst"><MailCheck size={16} aria-hidden="true" /> Alle læst</Action>}
        {actions.toggleDeleted && <Action source={actions.toggleDeleted} className="lx-chip-button"><Trash2 size={16} aria-hidden="true" /> Vis/skjul slettede</Action>}
        <button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios visning <ArrowUpRight size={16} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="lx-list-controls">
      <form className="lx-search-field" onSubmit={runSearch} role="search"><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Filtrér listen – tryk Enter for at søge i alle beskeder" aria-label="Søg i beskeder" /></form>
      {selected.size > 0 && data.bulkOptions.length > 0 && <select className="lx-select" value="" onChange={e => bulk(e.target.value)} aria-label={`Handling for ${selected.size} valgte`}>
        <option value="">{selected.size} valgt – vælg handling</option>
        {data.bulkOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>}
    </div>
    {data.messages.length ? (visible.length ? <ul className="lx-message-list">{visible.map((m, i) => <MessageRow key={(m.select?.id || '') + i} message={m} selected={!!m.select && selected.has(m.select.id)} onSelect={v => select(m, v)} />)}</ul> : <Empty>Ingen beskeder matcher. Tryk Enter for at søge i alle beskeder.</Empty>) : <Empty>Der er ingen beskeder i denne mappe.</Empty>}
  </div>;
}
