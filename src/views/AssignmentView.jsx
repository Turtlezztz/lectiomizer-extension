import React, { useState } from 'react';
import { ArrowLeft, ArrowUpRight, FileText, Paperclip, Send, Upload } from 'lucide-react';
import { Action, Empty, RichText, formatDeadline, relativeDay } from './shared.jsx';

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
      <aside className="lx-assignment-side">
        <dl className="lx-details">{detailOrder.filter(k => data.info[k]?.text).map(k => <div key={k}><dt>{k}</dt><dd>{data.info[k].text}</dd></div>)}</dl>
        {me && (me.grade || me.gradeNote || me.studentNote || absence) && <dl className="lx-details">
          {absence && <div><dt>Fravær</dt><dd>{absence.replace(/^Fravær:\s*/i, '')}</dd></div>}
          {me.grade && <div><dt>Karakter</dt><dd>{me.grade}</dd></div>}
          {me.gradeNote && <div><dt>Karakternote</dt><dd>{me.gradeNote}</dd></div>}
          {me.studentNote && <div><dt>Elevnote</dt><dd>{me.studentNote}</dd></div>}
        </dl>}
        {data.group.length > 0 && <div className="lx-side-block"><h3>Gruppe</h3><ul>{data.group.map(name => <li key={name}>{name}</li>)}</ul></div>}
      </aside>
    </div>
  </div>;
}
