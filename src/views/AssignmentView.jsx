import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, FileText, Paperclip, Send, Upload, UserPlus, X } from 'lucide-react';
import { Action, Empty, RichText, formatDeadline, relativeDay } from './shared.jsx';
import { Avatar, usePhotos } from './avatars.jsx';
import { useStalled } from './ThreadView.jsx';
import { personName } from '../readers/thread.js';

const detailOrder = ['Hold', 'Ansvarlig', 'Afleveringsfrist', 'Elevtid', 'Karakterskala', 'I undervisningsbeskrivelse'];

function HandIn({ handIn }) {
  const [comment, setComment] = useState(handIn.comment?.value || '');
  const sync = value => { setComment(value); if (handIn.comment) handIn.comment.value = value; };
  return <section className="lx-view-section lx-hand-in" aria-labelledby="lx-hand-in">
    <h2 id="lx-hand-in">Aflever eller skriv et indlæg</h2>
    <label className="lx-field-label" htmlFor="lx-hand-in-comment">Kommentar (valgfri)</label>
    <textarea id="lx-hand-in-comment" className="lx-textarea" value={comment} onChange={e => sync(e.target.value)} rows={4} placeholder="Skriv til din lærer…" />
    {handIn.chosen && <p className="lx-quiet"><Paperclip size={14} aria-hidden="true" /> {handIn.chosen}</p>}
    <div className="lx-button-row">
      {handIn.upload && <Action source={handIn.upload} className="lx-primary-button"><Upload size={16} aria-hidden="true" /> Vælg dokument og aflever</Action>}
      {handIn.send && <Action source={handIn.send} className="lx-chip-button" disabled={!comment.trim()}><Send size={16} aria-hidden="true" /> Send kun kommentar</Action>}
    </div>
  </section>;
}

// Who hands in together. Adding picks a classmate in Lectio's own list and
// presses its Tilføj; removing presses Lectio's remove button, which asks first.
// Either way Lectio loads the page again with the new group.
function Group({ group, base }) {
  const [choice, setChoice] = useState('');
  // {value, name} while Lectio adds someone.
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const { members, add } = group;
  const photos = usePhotos(base, [...members.map(m => m.id), pending && `S${pending.value}`].filter(Boolean));
  const count = members.length;
  const seen = useRef(count);
  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    setPending(null);
    setChoice('');
  }, [count]);
  useStalled(pending, () => { setPending(null); setError('Lectio svarede ikke. Prøv igen, eller brug Lectios visning.'); });

  const submit = () => {
    const option = add.options.find(o => o.value === choice);
    if (!option || pending || !add.button.isConnected) return;
    add.select.value = option.value;
    setError('');
    setPending({ value: option.value, name: personName(option.label) });
    add.button.click();
  };
  const remove = member => { if (!pending && member.remove.isConnected) member.remove.click(); };

  return <section className="lx-group" aria-labelledby="lx-group">
    <h3 id="lx-group">Gruppe <span className="lx-count">{count}</span></h3>
    <ul className="lx-group-members">
      {members.map(m => <li key={m.id || m.full}>
        <Avatar person={m} photo={photos[m.id]} size={32} />
        <span className="lx-group-name"><strong title={m.full}>{m.name}</strong>{(m.className || m.me) && <small>{[m.me && 'Dig', m.className].filter(Boolean).join(' · ')}</small>}</span>
        {m.remove && <button type="button" className="lx-icon-chip lx-group-remove" aria-label={`Fjern ${m.name} fra gruppen`} title={`Fjern ${m.name} fra gruppen`} disabled={!!pending} onClick={() => remove(m)}><X size={16} aria-hidden="true" /></button>}
      </li>)}
      {pending && <li className="lx-pending" role="status">
        <Avatar person={{ id: `S${pending.value}`, name: pending.name }} photo={photos[`S${pending.value}`]} size={32} />
        <span className="lx-group-name"><strong>{pending.name}</strong><small>Tilføjer …</small></span>
      </li>}
    </ul>
    {add && count <= 1 && !pending && <p className="lx-quiet lx-group-hint">Du afleverer alene, indtil du tilføjer dem, du skal aflevere sammen med.</p>}
    {add && (add.options.length ? <div className="lx-group-add">
      <label className="lx-field-label" htmlFor="lx-group-add">Tilføj til gruppen</label>
      <div className="lx-group-add-row">
        <select id="lx-group-add" className="lx-select" value={choice} disabled={!!pending} onChange={e => { setChoice(e.target.value); setError(''); }}>
          <option value="">Vælg elev …</option>
          {add.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className="lx-chip-button" disabled={!choice || !!pending} onClick={submit}><UserPlus size={16} aria-hidden="true" /> Tilføj</button>
      </div>
      {error && <p className="lx-group-error" role="alert">{error}</p>}
    </div> : <p className="lx-quiet lx-group-hint">Der er ikke flere elever, du kan tilføje.</p>)}
  </section>;
}

function Entries({ entries }) {
  return <section className="lx-view-section" aria-labelledby="lx-entries">
    <h2 id="lx-entries">Indlæg <span className="lx-count">{entries.length}</span></h2>
    {entries.length ? <ol className="lx-timeline">{entries.map((entry, i) => <li key={i}>
      <div className="lx-timeline-head"><strong title={entry.userTitle || undefined}>{entry.user}</strong><span>{entry.time ? formatDeadline(entry.time) : entry.timeText}</span></div>
      {entry.comment && entry.comment.textContent.trim() && <RichText node={entry.comment} className="lx-timeline-body" />}
      {entry.documents.map(doc => <a key={doc.href} className="lx-file" href={doc.href}><FileText size={16} aria-hidden="true" />{doc.label || 'Dokument'}</a>)}
    </li>)}</ol> : <Empty>Der er ingen indlæg endnu.</Empty>}
  </section>;
}

export function AssignmentView({ data, showOriginal }) {
  const me = data.students[0];
  const [status, absence] = (me?.status || '').split(/\s*\/\s*/);
  const description = data.info.Opgavebeskrivelse;
  const note = data.info.Opgavenote?.text;
  return <div className="lx-assignment-page">
    <div className="lx-activity-bar">
      {data.back && <Action source={data.back} className="lx-chip-button"><ArrowLeft size={16} aria-hidden="true" /> Opgaver</Action>}
      <span className="lx-bar-end"><button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios visning <ArrowUpRight size={16} aria-hidden="true" /></button></span>
    </div>
    <header className="lx-assignment-head">
      <h2>{data.title}</h2>
      <p>
        {data.deadline && <span>Frist {formatDeadline(data.deadline)} · {relativeDay(data.deadline)}</span>}
        {status && <span className={`lx-pill ${/afleveret/i.test(status) ? 'lx-pill-done' : /mangler/i.test(status) ? 'lx-pill-alert' : 'lx-pill-open'}`}>{status}</span>}
        {me?.awaiting && <span className="lx-quiet">Afventer {me.awaiting.toLowerCase()}</span>}
      </p>
    </header>
    <div className="lx-assignment-layout">
      <div className="lx-assignment-primary">
        {(description?.links.length > 0 || note) && <section className="lx-view-section" aria-labelledby="lx-description">
          <h2 id="lx-description">Opgavebeskrivelse</h2>
          {description?.links.map(doc => <a key={doc.href} className="lx-file" href={doc.href}><FileText size={16} aria-hidden="true" />{doc.label}</a>)}
          {note && <p className="lx-reading">{note}</p>}
        </section>}
        <Entries entries={data.entries} />
        {data.handIn ? <HandIn handIn={data.handIn} /> : <p className="lx-view-notice">Afleveringen er afsluttet. Der kan ikke skrives flere indlæg.</p>}
      </div>
      {data.group && <Group group={data.group} base={data.base} />}
      <aside className="lx-assignment-side">
        <dl className="lx-details">{detailOrder.filter(k => data.info[k]?.text).map(k => <div key={k}><dt>{k}</dt><dd>{data.info[k].text}</dd></div>)}</dl>
        {me && (me.grade || me.gradeNote || me.studentNote || absence) && <dl className="lx-details">
          {absence && <div><dt>Fravær</dt><dd>{absence.replace(/^Fravær:\s*/i, '')}</dd></div>}
          {me.grade && <div><dt>Karakter</dt><dd>{me.grade}</dd></div>}
          {me.gradeNote && <div><dt>Karakternote</dt><dd>{me.gradeNote}</dd></div>}
          {me.studentNote && <div><dt>Elevnote</dt><dd>{me.studentNote}</dd></div>}
        </dl>}
      </aside>
    </div>
  </div>;
}
