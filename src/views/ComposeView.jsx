// A new message, laid out like the start of a chat: who it goes to and the
// subject at the top, the people it will reach in the middle, the message at
// the bottom. Every field writes into Lectio's own (hidden) form; adding or
// removing a recipient and sending press Lectio's own buttons.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, ChevronLeft, Paperclip, Users, X } from 'lucide-react';
import { Action } from './shared.jsx';
import { Avatar, usePhotos } from './avatars.jsx';
import { FileChips, listNames, touchScreen, useAutoGrow, useFillWindow, useStalled } from './ThreadView.jsx';
import { fold, searchDirectory, useDirectory } from './recipients.js';
import { personName } from '../readers/thread.js';

// Adding a recipient makes Lectio load the page again; this puts the cursor back.
const FOCUS = 'lectiomizer:compose-focus';
const remember = field => { try { sessionStorage.setItem(FOCUS, field); } catch {} };
const recall = () => { try { const field = sessionStorage.getItem(FOCUS); sessionStorage.removeItem(FOCUS); return field; } catch { return null; } };

export function ComposeView({ compose, showOriginal }) {
  const shell = useRef(null);
  const fields = { to: useRef(null), subject: useRef(null), body: useRef(null) };
  const [subject, setSubject] = useState(() => compose.subject.value);
  const [body, setBody] = useState(() => compose.body.value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // {type: 'add', title} | {type: 'remove', index} | {type: 'send', text} while Lectio answers.
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const directory = useDirectory(compose.sources);
  useFillWindow(shell);
  useAutoGrow(fields.body, body, 240);

  // Recipients Lectio lists without a context card are matched by name to the search lists.
  const byTitle = useMemo(() => new Map(directory.items.map(item => [fold(item.title), item])), [directory.items]);
  const recipients = compose.recipients.map(r => ({ ...r, id: r.id || byTitle.get(fold(r.full))?.key || '' }));
  const photos = usePhotos(compose.base, recipients.map(r => r.id));
  // Neither someone already on the message nor the student themselves.
  const skip = item => compose.me.ids.includes(item.key) || (!!compose.me.name && personName(item.title) === compose.me.name)
    || recipients.some(r => (r.id && r.id === item.key) || fold(r.full) === fold(item.title));
  const results = searchDirectory(directory.items, query, skip);

  useEffect(() => { fields[recall()]?.current?.focus(); }, []);
  // Lectio answered: its list of recipients changed.
  const count = compose.recipients.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    setPending(null);
    // Lectio changed the page in place instead of loading it again.
    if (recall() === 'to') fields.to.current?.focus();
  }, [count]);
  useStalled(pending, () => { setPending(null); setError('Lectio svarede ikke. Prøv igen, eller brug Lectios visning.'); });

  const write = (native, set) => value => { set(value); native.value = value; setError(''); };
  const writeSubject = write(compose.subject, setSubject);
  const writeBody = write(compose.body, setBody);

  const add = item => {
    if (pending) return;
    compose.search.input.value = item.title;
    compose.search.id.value = item.key;
    remember('to');
    setQuery('');
    setOpen(false);
    setPending({ type: 'add', title: item.title });
    compose.search.add.click();
  };
  const remove = (recipient, index) => {
    if (pending || !recipient.remove) return;
    remember('to');
    setPending({ type: 'remove', index });
    recipient.remove.click();
  };
  const send = () => {
    if (pending) return;
    const missing = !recipients.length ? ['to', 'Tilføj mindst én modtager.'] : !subject.trim() ? ['subject', 'Skriv et emne.'] : !body.trim() ? ['body', 'Skriv en besked.'] : null;
    if (missing) { setError(missing[1]); fields[missing[0]].current?.focus(); return; }
    compose.subject.value = subject;
    compose.body.value = body;
    setPending({ type: 'send', text: body });
    compose.send.click();
  };
  const searchKeys = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive(a => Math.max(0, Math.min(results.length - 1, a + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter') {
      // Enter in a field would otherwise submit Lectio's form.
      e.preventDefault();
      if (results[active]) add(results[active]);
    } else if (e.key === 'Escape') setOpen(false);
  };

  const sending = pending?.type === 'send';
  // Lectio's own limits: 100 characters for the subject, 100.000 for the text.
  const subjectLimit = compose.subject.maxLength > 0 ? compose.subject.maxLength : 100;
  const listOpen = open && !!query.trim();
  const names = recipients.map(r => r.name);
  const back = <><ChevronLeft size={20} aria-hidden="true" /><span>Beskeder</span></>;

  return <section ref={shell} className="lx-thread lx-compose" aria-label="Ny besked">
    <header className="lx-thread-head">
      {compose.cancel ? <Action source={compose.cancel} className="lx-thread-back">{back}</Action> : <a className="lx-thread-back" href={compose.back}>{back}</a>}
      <div className="lx-thread-who"><div className="lx-thread-heading"><h2>Ny besked</h2></div></div>
      <div className="lx-thread-actions">
        <button type="button" className="lx-icon-chip" title="Lectios visning" aria-label="Lectios visning" onClick={showOriginal}><ArrowUpRight size={17} aria-hidden="true" /></button>
      </div>
    </header>
    <div className="lx-compose-fields">
      <div className="lx-compose-to-wrap">
        {/* A click on the empty part of the row goes to the search field. */}
        <div className="lx-compose-row" onClick={e => { if (e.target.matches('.lx-compose-row, .lx-compose-recipients')) fields.to.current?.focus(); }}>
          <label className="lx-compose-label" htmlFor="lx-compose-to">Til:</label>
          <div className="lx-compose-recipients">
            <ul className="lx-recipient-chips" aria-label="Modtagere">
              {recipients.map((r, i) => <li key={i} className={`lx-recipient${pending?.type === 'remove' && pending.index === i ? ' lx-pending' : ''}`}>
                <Avatar person={r} photo={photos[r.id]} size={22} /><span title={r.full}>{r.name}</span>
                {r.remove && <button type="button" aria-label={`Fjern ${r.name}`} title={`Fjern ${r.name}`} disabled={!!pending} onClick={() => remove(r, i)}><X size={13} aria-hidden="true" /></button>}
              </li>)}
              {pending?.type === 'add' && <li className="lx-recipient lx-pending"><span>{personName(pending.title)}</span></li>}
            </ul>
            <input ref={fields.to} id="lx-compose-to" className="lx-compose-search" type="text" autoComplete="off" value={query}
              placeholder={recipients.length ? 'Tilføj flere' : 'Lærer, elev, klasse eller hold'}
              role="combobox" aria-autocomplete="list" aria-expanded={listOpen} aria-controls="lx-compose-results" aria-activedescendant={listOpen && results[active] ? `lx-compose-result-${active}` : undefined}
              onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
              onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={searchKeys} />
          </div>
        </div>
        {listOpen && <ul id="lx-compose-results" className="lx-recipient-results" role="listbox" aria-label="Forslag">
          {directory.status === 'loading' ? <li className="lx-recipient-note">Henter modtagere …</li>
            : directory.status === 'error' ? <li className="lx-recipient-note">Modtagerne kunne ikke hentes. Brug Lectios visning for at vælge dem.</li>
            : results.length ? results.map((item, i) => <li key={item.key} id={`lx-compose-result-${i}`} role="option" aria-selected={i === active} className="lx-recipient-option"
              onMouseDown={e => { e.preventDefault(); add(item); }} onMouseEnter={() => setActive(i)}>
              <Avatar person={{ id: item.key, name: personName(item.title) }} size={30} />
              <span><strong>{item.title}</strong>{item.kind && <small>{item.kind}</small>}</span>
            </li>)
            : <li className="lx-recipient-note">Ingen modtagere matcher „{query.trim()}“.</li>}
        </ul>}
      </div>
      <div className="lx-compose-row">
        <label className="lx-compose-label" htmlFor="lx-compose-subject">Emne:</label>
        <input ref={fields.subject} id="lx-compose-subject" className="lx-compose-subject" type="text" maxLength={subjectLimit} value={subject} disabled={sending} aria-describedby="lx-compose-limit"
          onChange={e => writeSubject(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fields.body.current?.focus(); } }} />
        <small id="lx-compose-limit" className="lx-compose-limit">maks. {subjectLimit} tegn</small>
      </div>
    </div>
    <div className="lx-thread-log lx-compose-stage">
      {sending ? <div className="lx-thread-group lx-own lx-pending">
        <div className="lx-thread-stack">
          <div className="lx-thread-message"><div className="lx-bubble-row"><div className="lx-bubble lx-tail"><div className="lx-bubble-body lx-bubble-plain">{pending.text}</div></div></div></div>
          <span className="lx-thread-status" role="status">Sender …</span>
        </div>
      </div>
      : recipients.length ? <div className="lx-compose-hero">
        <span className="lx-thread-faces lx-stacked">
          {recipients.slice(0, 4).map((r, i) => <Avatar key={i} person={r} photo={photos[r.id]} size={52} />)}
          {recipients.length > 4 && <span className="lx-avatar lx-avatar-more" style={{ '--lx-avatar-size': '52px' }}>+{recipients.length - 4}</span>}
        </span>
        <p className="lx-compose-names">{listNames(names)}</p>
        {subject.trim() && <p className="lx-compose-preview">{subject}</p>}
      </div>
      : <div className="lx-compose-hero">
        <span className="lx-avatar" style={{ '--lx-avatar-size': '52px' }} aria-hidden="true"><Users size={24} /></span>
        <p className="lx-compose-names">Hvem skal beskeden til?</p>
        <p className="lx-compose-preview">Søg efter en lærer, en elev, en klasse eller et hold i feltet Til.</p>
      </div>}
    </div>
    <div className="lx-thread-composer">
      {(error || compose.errors.length > 0) && <p className="lx-thread-error" role="alert">{error || compose.errors.join(' ')}</p>}
      <FileChips files={compose.files} />
      <div className="lx-thread-compose-row">
        {compose.attach && <Action source={compose.attach} className="lx-icon-chip lx-thread-attach" title="Vedhæft fil"><Paperclip size={18} aria-hidden="true" /></Action>}
        <div className="lx-thread-field">
          <textarea ref={fields.body} rows={1} value={sending ? '' : body} disabled={sending} aria-label="Besked" placeholder="Skriv din besked" maxLength={compose.body.maxLength > 0 ? compose.body.maxLength : undefined}
            onChange={e => writeBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touchScreen(e.currentTarget)) { e.preventDefault(); send(); } }} />
          <button type="button" className="lx-thread-send" aria-label="Send" title="Send (Enter)" disabled={!!pending || !body.trim()} onClick={send}><ArrowUp size={18} strokeWidth={2.4} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="lx-compose-options">
        {compose.noReply && <label className="lx-switch"><input type="checkbox" defaultChecked={compose.noReply.input.checked} onChange={e => { compose.noReply.input.checked = e.target.checked; }} />{compose.noReply.label}</label>}
        <span className="lx-compose-hint">Enter sender · Shift+Enter giver ny linje</span>
      </div>
    </div>
  </section>;
}
