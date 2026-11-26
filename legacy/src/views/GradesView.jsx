import React from 'react';
import { ArrowUpRight, ChevronDown, Info } from 'lucide-react';

const typeNames = [
  [/^1\.?\s*standpunkt/i, '1. standpunkt'],
  [/^2\.?\s*standpunkt/i, '2. standpunkt'],
  [/^afsl(uttende|\.)/i, 'Afsluttende standpunkt'],
  [/intern prøve/i, 'Intern prøve'],
  [/^årskarakter/i, 'Årskarakter'],
  [/^eksamens/i, 'Eksamen'],
];
const typeName = label => typeNames.find(([pattern]) => pattern.test(label))?.[1] || label;
// "6688A Dansk" → "Dansk"
const xprsName = value => (value || '').replace(/^\d{3,6}[A-Z-]?\s+/, '');

function SectionError({ title, error, showOriginal }) {
  return <p className="lx-view-notice" role="status"><Info size={18} aria-hidden="true" /><span>{title} kunne ikke læses ({error}).</span><button type="button" onClick={showOriginal}>Vis i Lectio</button></p>;
}

function Summary({ diplomas }) {
  const diploma = diplomas.find(d => d.averages?.length);
  if (!diploma) return null;
  return <section className="lx-grade-summary" aria-label="Eksamensresultat">
    <dl>{diploma.averages.map(a => <div key={a.label} className="lx-stat"><dt>{a.label}</dt><dd>{a.value}</dd></div>)}</dl>
    <p>{[diploma.averages[0].note && diploma.averages[0].note[0].toUpperCase() + diploma.averages[0].note.slice(1), `Bevistype ${diploma.title}`].filter(Boolean).join(' · ')}</p>
  </section>;
}

function GradeStep({ grade }) {
  const detail = [grade.source && `Kilde: ${grade.source}`, grade.weight && `Vægt: ${grade.weight}`].filter(Boolean).join(' · ');
  return <li className={grade.final ? 'lx-grade-step lx-grade-final' : 'lx-grade-step'} title={detail || undefined}>
    <span className="lx-grade-type">{typeName(grade.type)}</span>
    <span className="lx-grade-value">{grade.value}</span>
    {grade.extra.map(line => <span key={line} className="lx-grade-extra">{line}</span>)}
  </li>;
}

function CurrentGrades({ term, current, notices }) {
  return <section className="lx-view-section" aria-labelledby="lx-grades-current">
    <h2 id="lx-grades-current">Karakterer{term ? ` i ${term}` : ''}</h2>
    {notices.map(notice => <p key={notice} className="lx-view-notice"><Info size={18} aria-hidden="true" /><span>{notice}</span></p>)}
    {current.subjects.length ? <ul className="lx-subject-list">{current.subjects.map(s => <li key={s.subject + s.hold} className="lx-subject">
      <div className="lx-subject-head"><strong>{s.subject}</strong>{s.hold && <span>{s.hold}</span>}</div>
      <div className="lx-subject-forms">{s.forms.map(f => <div key={f.form} className="lx-form-row">
        <span className="lx-form-label">{f.form || 'Samlet'}</span>
        {f.grades.length ? <ol className="lx-grade-steps">{f.grades.map(g => <GradeStep key={g.type} grade={g} />)}</ol> : <span className="lx-quiet">Ingen karakterer endnu</span>}
      </div>)}</div>
    </li>)}</ul> : <p className="lx-empty-state">Der er ingen karakterer{term ? ` i ${term}` : ''} endnu. Vælg et tidligere skoleår øverst for at se dine tidligere karakterer.</p>}
  </section>;
}

function Diploma({ diploma, index }) {
  return <section className="lx-view-section" aria-labelledby={`lx-grades-diploma-${index}`}>
    <h2 id={`lx-grades-diploma-${index}`}>Eksamensbevis <span className="lx-heading-meta">{diploma.title}</span></h2>
    <div className="lx-data-frame"><table className="lx-data-table lx-diploma-table">
      <thead><tr><th scope="col">Fag</th>{diploma.groups.map(g => <th key={g} scope="col">{g}</th>)}</tr></thead>
      <tbody>{diploma.lines.map(line => <tr key={line.subject}>
        <th scope="row">{line.subject}</th>
        {line.results.map(r => <td key={r.label} data-label={r.label}>{r.empty ? <span className="lx-quiet" aria-label="Ingen karakter">–</span> : <>
          <strong className="lx-table-grade">{r.fields.Karakter ?? '–'}</strong>
          <small>{[r.fields['Vægt'] && `vægt ${r.fields['Vægt']}`, r.fields.ECTS && `ECTS ${r.fields.ECTS}`].filter(Boolean).join(' · ')}</small>
        </>}</td>)}
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function RecordTable({ table, label }) {
  return <div className="lx-data-frame"><table className="lx-data-table" aria-label={label}>
    <thead><tr>{table.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
    <tbody>{table.rows.map((row, i) => <tr key={i}>{table.columns.map(c => <td key={c} data-label={c}>{row[c]}</td>)}</tr>)}</tbody>
  </table></div>;
}

function Protocol({ protocol }) {
  const known = ['Termin', 'XPRS fag', 'Karakter'].every(c => protocol.columns.includes(c));
  const terms = new Map();
  for (const row of protocol.rows) {
    const term = row.Termin || 'Uden termin';
    if (!terms.has(term)) terms.set(term, []);
    terms.get(term).push(row);
  }
  return <details className="lx-view-disclosure">
    <summary><span>Protokollinjer</span><span className="lx-count">{protocol.rows.length}</span><ChevronDown size={18} aria-hidden="true" /></summary>
    <p className="lx-disclosure-intro">Datagrundlaget for dit eksamensbevis, nyeste termin først.</p>
    {!known ? <RecordTable table={protocol} label="Protokollinjer" /> : Array.from(terms, ([term, rows]) => <section key={term} className="lx-protocol-term" aria-label={term}>
      <h3>{term}</h3>
      <ul>{rows.map((row, i) => <li key={i} className="lx-protocol-row">
        <div className="lx-protocol-main"><strong title={row['XPRS fag']}>{xprsName(row['XPRS fag'])}</strong><span>{[typeName(row.Type || ''), row.Evalueringsform].filter(Boolean).join(' · ')}</span></div>
        <span className="lx-protocol-grade">{row.Karakter}</span>
        <div className="lx-protocol-meta">{[row['Vægt'] && `Vægt ${row['Vægt']}`, row.Hold, row.Skala, row['Medtæller'] === 'Nej' && 'Tæller ikke med'].filter(Boolean).join(' · ')}</div>
      </li>)}</ul>
    </section>)}
  </details>;
}

function Supplementary({ notes, remarks, showOriginal }) {
  const parts = [['Karakternoter', notes], ['Bemærkninger', remarks]].filter(([, t]) => t);
  const empty = parts.filter(([, t]) => !t.error && !t.rows.length);
  return <section className="lx-view-section lx-supplementary" aria-label="Karakternoter og bemærkninger">
    {parts.map(([title, t]) => t.error ? <SectionError key={title} title={title} error={t.error} showOriginal={showOriginal} /> : t.rows.length ? <div key={title}><h2>{title}</h2><RecordTable table={t} label={title} /></div> : null)}
    {empty.length > 0 && <p className="lx-quiet">{empty.map(([title]) => `Ingen ${title.toLowerCase()}`).join(' · ')}</p>}
  </section>;
}

export function GradesView({ data, showOriginal }) {
  return <div className="lx-grades">
    <header className="lx-view-head">
      <div><h2>Dine karakterer</h2><p>Standpunkter, årskarakterer og eksamensbevis samlet ét sted.</p></div>
      <button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios visning <ArrowUpRight size={16} aria-hidden="true" /></button>
    </header>
    <Summary diplomas={data.diplomas.filter(d => !d.error)} />
    <CurrentGrades term={data.term} current={data.current} notices={data.notices} />
    {data.diplomas.map((d, i) => d.error ? <SectionError key={i} title="Eksamensbeviset" error={d.error} showOriginal={showOriginal} /> : <Diploma key={d.title + i} diploma={d} index={i} />)}
    {data.protocol && (data.protocol.error ? <SectionError title="Protokollinjerne" error={data.protocol.error} showOriginal={showOriginal} /> : data.protocol.rows.length > 0 && <Protocol protocol={data.protocol} />)}
    <Supplementary notes={data.notes} remarks={data.remarks} showOriginal={showOriginal} />
  </div>;
}
