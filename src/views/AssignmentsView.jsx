import React, { useMemo, useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { Empty, formatDeadline, relativeDay } from './shared.jsx';

const groups = [
  { kind: 'waiting', title: 'Kommende', order: 1 },
  { kind: 'missing', title: 'Mangler', order: -1 },
  { kind: 'delivered', title: 'Afleveret', order: -1 },
  { kind: 'other', title: 'Andre', order: -1 },
];
const statusClass = { missing: 'lx-pill-alert', waiting: 'lx-pill-open', delivered: 'lx-pill-done', other: '' };

function AssignmentRow({ item }) {
  return <li className={`lx-assignment lx-assignment-${item.statusKind}`}>
    <div className="lx-assignment-when">
      <span>{item.deadline ? formatDeadline(item.deadline) : item.deadlineText}</span>
      {item.deadline && item.statusKind !== 'delivered' && <small>{relativeDay(item.deadline)}</small>}
    </div>
    <div className="lx-assignment-main">
      {item.href ? <a href={item.href}>{item.title}</a> : <strong>{item.title}</strong>}
      {item.note && <small title={item.note}>{item.note}</small>}
    </div>
    <span className="lx-assignment-hold">{item.hold}</span>
    <span className="lx-assignment-time" title="Elevtid">{item.studentTime && `${item.studentTime} t`}</span>
    <span className="lx-assignment-status">
      <span className={`lx-pill ${statusClass[item.statusKind]}`}>{item.status || '–'}</span>
      {/lærer/i.test(item.awaiting) && <small>Afventer lærer</small>}
      {item.grade && <small>Karakter {item.grade}</small>}
    </span>
  </li>;
}

export function AssignmentsView({ data, showOriginal }) {
  const [query, setQuery] = useState('');
  const [hold, setHold] = useState('');
  const [kind, setKind] = useState('');
  const holds = useMemo(() => [...new Set(data.assignments.map(a => a.hold).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'da')), [data.assignments]);
  const q = query.trim().toLocaleLowerCase('da');
  const visible = data.assignments.filter(a => (!hold || a.hold === hold) && (!q || [a.title, a.hold, a.note].join(' ').toLocaleLowerCase('da').includes(q)));
  const count = k => visible.filter(a => a.statusKind === k).length;
  return <div className="lx-assignments">
    <div className="lx-list-controls">
      <label className="lx-search-field"><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Søg i opgaver…" aria-label="Søg i opgaver" /></label>
      {holds.length > 1 && <select className="lx-select" value={hold} onChange={e => setHold(e.target.value)} aria-label="Vis hold"><option value="">Alle hold</option>{holds.map(h => <option key={h} value={h}>{h}</option>)}</select>}
      {data.filters.map(f => <label key={f.label} className="lx-switch"><input type="checkbox" checked={f.checked} onChange={() => f.source.click()} /><span>{f.label}</span></label>)}
      <button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios visning <ArrowUpRight size={16} aria-hidden="true" /></button>
    </div>
    <div className="lx-segments" role="group" aria-label="Status">
      <button type="button" aria-pressed={!kind} onClick={() => setKind('')}>Alle <span>{visible.length}</span></button>
      {groups.filter(g => count(g.kind)).map(g => <button key={g.kind} type="button" aria-pressed={kind === g.kind} onClick={() => setKind(kind === g.kind ? '' : g.kind)}>{g.title} <span>{count(g.kind)}</span></button>)}
    </div>
    {!data.assignments.length ? <Empty>{data.empty}</Empty> : !visible.length ? <Empty>Ingen opgaver matcher. Prøv et andet ord eller hold.</Empty> :
      groups.filter(g => (!kind || kind === g.kind) && count(g.kind)).map(g => {
        const items = visible.filter(a => a.statusKind === g.kind).sort((a, b) => ((a.deadline?.getTime() || 0) - (b.deadline?.getTime() || 0)) * g.order);
        return <section key={g.kind} className="lx-view-section lx-assignment-group" aria-labelledby={`lx-group-${g.kind}`}>
          <h2 id={`lx-group-${g.kind}`}>{g.title} <span className="lx-count">{items.length}</span></h2>
          <ul className="lx-assignment-list">{items.map((item, i) => <AssignmentRow key={(item.href || item.title) + i} item={item} />)}</ul>
        </section>;
      })}
  </div>;
}
