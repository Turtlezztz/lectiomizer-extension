import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ArrowUpRight, Printer, StickyNote, BookOpen } from 'lucide-react';
import { Action, Empty, LessonMeta, RichText } from './shared.jsx';

const statusLabel = { changed: 'Ændret', cancelled: 'Aflyst' };

function Toolbar({ data, showOriginal }) {
  const print = data.print.find(p => /vis udskrift/i.test(p.label)) || data.print[0];
  return <div className="lx-activity-bar">
    {data.back && <Action source={data.back.source} className="lx-chip-button" title={data.back.label}><ArrowLeft size={16} aria-hidden="true" /> Tilbage</Action>}
    <span className="lx-stepper" role="group" aria-label="Mine aktiviteter">
      <Action source={data.previous?.source} className="lx-icon-chip" title="Min forrige aktivitet"><ChevronLeft size={18} aria-label="Min forrige aktivitet" /></Action>
      <span>Mine aktiviteter</span>
      <Action source={data.next?.source} className="lx-icon-chip" title="Min næste aktivitet"><ChevronRight size={18} aria-label="Min næste aktivitet" /></Action>
    </span>
    {data.hold && <span className="lx-stepper" role="group" aria-label="Holdets aktiviteter">
      <Action source={data.hold.previous?.source} className="lx-icon-chip" title="Holdets forrige aktivitet"><ChevronLeft size={18} aria-label="Holdets forrige aktivitet" /></Action>
      <Action source={data.hold.source} className="lx-stepper-link">{data.hold.label}</Action>
      <Action source={data.hold.next?.source} className="lx-icon-chip" title="Holdets næste aktivitet"><ChevronRight size={18} aria-label="Holdets næste aktivitet" /></Action>
    </span>}
    <span className="lx-bar-end">
      {print && <Action source={print.source} className="lx-chip-button" title={print.label}><Printer size={16} aria-hidden="true" /> Udskriv</Action>}
      <button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios visning <ArrowUpRight size={16} aria-hidden="true" /></button>
    </span>
  </div>;
}

export function ActivityView({ data, showOriginal }) {
  const { lesson } = data;
  const title = lesson?.title || lesson?.holds.join(', ') || 'Lektion';
  const items = data.sections.flatMap(s => s.items.map(item => ({ ...item, section: s.title })));
  return <div className="lx-activity">
    <Toolbar data={data} showOriginal={showOriginal} />
    <header className={`lx-lesson-head lx-lesson-${lesson?.status || 'normal'}`}>
      <div>
        <h2>{title}{statusLabel[lesson?.status] && <span className="lx-badge">{statusLabel[lesson.status]}</span>}</h2>
        <LessonMeta lesson={lesson} />
      </div>
      {data.tabs.length > 1 && <nav className="lx-tabs" aria-label="Aktivitetens faner">{data.tabs.map(tab => tab.current
        ? <span key={tab.label} className="lx-tab lx-tab-current" aria-current="page">{tab.label}</span>
        : <Action key={tab.label} source={tab.source} className="lx-tab">{tab.label}</Action>)}</nav>}
    </header>
    {data.phases.length > 0 && <p className="lx-phases"><span>Forløb</span>{data.phases.map(p => <a key={p.href} href={p.href}>{p.label}</a>)}</p>}
    {data.note && <aside className="lx-callout"><StickyNote size={18} aria-hidden="true" /><div><strong>Note til lektionen</strong><p>{data.note}</p></div></aside>}
    <div className={items.length > 1 ? 'lx-activity-layout lx-with-toc' : 'lx-activity-layout'}>
      <div className="lx-activity-content">
        {data.sections.length ? data.sections.map((section, i) => <section key={i} className="lx-activity-section" aria-label={section.title || 'Indhold'}>
          {section.title && <h2 className="lx-section-title"><BookOpen size={18} aria-hidden="true" />{section.title}</h2>}
          {section.items.map(item => <article key={item.id} id={`lx-${item.id}`} className="lx-activity-item"><RichText node={item.node} /></article>)}
        </section>) : <Empty>{data.empty}</Empty>}
        {data.extras.length > 0 && <ul className="lx-activity-extras">{data.extras.map(e => <li key={e.label}>{e.href ? <a href={e.href}>{e.label}</a> : <span>{e.label}</span>}</li>)}</ul>}
      </div>
      {items.length > 1 && <nav className="lx-toc" aria-label="Indhold i lektionen"><p>I denne lektion</p><ol>{items.map(item => <li key={item.id}><a href={`#lx-${item.id}`} onClick={e => { e.preventDefault(); document.getElementById(`lx-${item.id}`)?.scrollIntoView({ block: 'start' }); }}>{item.title || item.section || 'Indhold'}</a></li>)}</ol></nav>}
    </div>
  </div>;
}
