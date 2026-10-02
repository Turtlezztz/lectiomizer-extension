import React, { useState } from 'react';
import { ArrowUpRight, ChevronDown, Pencil } from 'lucide-react';
import { Empty } from './shared.jsx';

const lessonLabel = row => row.lesson ? [row.lesson.date, row.lesson.module].filter(Boolean).join(' · ') : row.lessonText;
const lessonMeta = row => row.lesson ? [...row.lesson.holds, ...row.lesson.teachers, row.lesson.room].filter(Boolean).join(' · ') : '';

function MissingList({ table }) {
  const [all, setAll] = useState(false);
  const rows = all ? table.rows : table.rows.slice(0, 12);
  return <section className="lx-view-section" aria-labelledby="lx-absence-missing">
    <h2 id="lx-absence-missing">Mangler fraværsårsag <span className="lx-count">{table.rows.length}</span></h2>
    {table.rows.length ? <>
      <ul className="lx-absence-list">{rows.map((row, i) => <li key={i} className="lx-absence-row">
        <div className="lx-absence-lesson">{row.lesson?.href ? <a href={row.lesson.href}>{lessonLabel(row)}</a> : <strong>{lessonLabel(row)}</strong>}<small>{lessonMeta(row)}</small></div>
        <span className="lx-absence-amount">{row.amount}</span>
        {row.edit && <a className="lx-chip-button" href={row.edit}><Pencil size={14} aria-hidden="true" /> Angiv årsag</a>}
      </li>)}</ul>
      {table.rows.length > rows.length && <button type="button" className="lx-more" onClick={() => setAll(true)}>Vis alle {table.rows.length}</button>}
    </> : <Empty>{table.empty || 'Ingen manglende fraværsårsager.'}</Empty>}
  </section>;
}

function History({ table }) {
  return <details className="lx-view-disclosure">
    <summary><span>Fraværsregistreringer</span><span className="lx-count">{table.rows.length}</span><ChevronDown size={18} aria-hidden="true" /></summary>
    {table.rows.length ? <ul className="lx-absence-list">{table.rows.map((row, i) => <li key={i} className="lx-absence-row">
      <div className="lx-absence-lesson">{row.lesson?.href ? <a href={row.lesson.href}>{lessonLabel(row)}</a> : <strong>{lessonLabel(row)}</strong>}<small>{lessonMeta(row)}</small></div>
      <div className="lx-absence-cause">{row.cause ? <strong>{row.cause}</strong> : <span className="lx-quiet">Ingen årsag</span>}{row.comment && <small title={row.comment}>{row.comment}</small>}</div>
      <span className="lx-absence-amount">{row.amount}<small>{[row.registered, row.registeredBy].filter(Boolean).join(' ')}</small></span>
      {row.edit && <a className="lx-icon-chip" href={row.edit} title="Ret fraværsårsag" aria-label={`Ret fraværsårsag for ${lessonLabel(row)}`}><Pencil size={15} aria-hidden="true" /></a>}
    </li>)}</ul> : <Empty>{table.empty || 'Ingen registreringer.'}</Empty>}
  </details>;
}

export function AbsenceView({ data, showOriginal }) {
  return <div className="lx-absence">
    <div className="lx-absence-top">
      {data.totals.length > 0 && <dl className="lx-grade-summary lx-absence-totals">{data.totals.map(t => <div key={t.label} className="lx-stat"><dt>{t.label}</dt><dd>{t.value}</dd></div>)}</dl>}
      <button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios visning <ArrowUpRight size={16} aria-hidden="true" /></button>
    </div>
    {data.missing && <MissingList table={data.missing} />}
    {data.history && <History table={data.history} />}
  </div>;
}
