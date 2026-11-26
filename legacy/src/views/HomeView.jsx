import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ClipboardList, Mail, Megaphone } from 'lucide-react';
import { Empty, RichText, formatDeadline, relativeDay } from './shared.jsx';
import { parseAssignmentTitle } from '../readers/home.js';

// Direction contract for this surface; emitted as an HTML comment before the view.
export const contract = `THESIS: Forside answers "what is next, and what needs me" with one next-lesson panel and one urgency-ranked list, refusing Lectio's ten equal dashboard islands.
OWN-WORLD: Compact. White ground, utility red only for now and for urgency, Source Sans 3, fine rules, subject fills from the timetable, a quiet side column.
STORY: The student sees the running or next lesson and its time left, scans what is due today, tomorrow and this week, then messages and school notices, and opens any item in Lectio.
FIRST VIEWPORT: Left two thirds: next-lesson panel (28px subject, time range, room, teacher, elapsed line when running), then "Brug for dig" buckets. Right third: today's lessons with times, coming days, classes. No greeting.
FORM: Surface candidate "Needs you", 7th of 7 on the ranked list, dealt by seed 56ddb12a and locked by the user.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance`;

const timeFormat = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });
const hm = date => timeFormat.format(date).replace('.', ':');
const span = lesson => lesson.time ? `${hm(lesson.time.start)}–${hm(lesson.time.end)}` : lesson.module;
const fill = name => { let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 5; };
const minutes = ms => Math.max(1, Math.round(ms / 60000));
const duration = ms => { const m = minutes(ms); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} t ${m % 60 ? `${m % 60} min` : ''}`.trim(); };

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  return now;
}

function NextLesson({ days, now, scheduleHref }) {
  const lessons = days.flatMap(d => d.lessons.map(l => ({ ...l, day: d.label })));
  const running = lessons.find(l => l.time && l.time.start <= now && now < l.time.end && l.status !== 'cancelled');
  const upcoming = lessons.find(l => l.time && l.time.start > now && l.status !== 'cancelled');
  const lesson = running || upcoming || (lessons.some(l => l.time) ? null : lessons.find(l => l.status !== 'cancelled'));
  if (!lesson) return <section className="lx-now lx-now-empty" aria-label="Næste lektion"><h2>Ingen flere lektioner</h2><p>Der er ikke flere lektioner i de dage, Lectio viser. <a href={scheduleHref}>Se hele skemaet</a></p></section>;
  const sameDay = lesson.time && lesson.time.start.toDateString() === now.toDateString();
  const when = running ? `slutter om ${duration(lesson.time.end - now)}`
    : lesson.time && sameDay ? `om ${duration(lesson.time.start - now)}`
    : lesson.time ? [lesson.day && lesson.day.toLocaleLowerCase('da'), relativeDay(lesson.time.start, now)].filter(Boolean).join(' · ') : lesson.day;
  const progress = running ? Math.min(1, (now - lesson.time.start) / (lesson.time.end - lesson.time.start)) : 0;
  return <section className={`lx-now lx-fill-${fill(lesson.holds[0])}${lesson.status !== 'normal' ? ` lx-now-${lesson.status}` : ''}`} aria-label={running ? 'Lektion i gang' : 'Næste lektion'}>
    <div className="lx-now-body">
      <h2>{lesson.title || lesson.holds.join(', ') || lesson.module}</h2>
      <p className="lx-now-when"><span className={running ? 'lx-now-state lx-live' : 'lx-now-state'}>{running ? 'Nu' : 'Næste'}</span><strong>{span(lesson)}</strong><span>{when}</span></p>
      <p className="lx-now-meta">{[lesson.title && lesson.holds.join(', '), lesson.module && lesson.time && lesson.module, ...lesson.teachers, lesson.room && `lokale ${lesson.room}`].filter(Boolean).join(' · ')}</p>
      {(lesson.homework || lesson.status !== 'normal') && <p className="lx-now-flags">
        {lesson.status === 'changed' && <span className="lx-badge">Ændret</span>}
        {lesson.status === 'cancelled' && <span className="lx-badge lx-badge-cancelled">Aflyst</span>}
        {lesson.homework && <span className="lx-now-homework"><BookOpen size={15} aria-hidden="true" /> Der er lektier</span>}
      </p>}
    </div>
    {lesson.href && <a className="lx-chip-button lx-now-open" href={lesson.href}>Åbn lektionen <ArrowRight size={16} aria-hidden="true" /></a>}
    {running && <span className="lx-now-progress" style={{ '--lx-progress': progress }} role="progressbar" aria-label="Tid gået af lektionen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} />}
  </section>;
}

function bucket(due, now) {
  if (!due) return 0;
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(due) - day(now)) / 86400000);
  if (diff < 0) return 1;
  if (diff === 0) return 2;
  if (diff === 1) return 3;
  if (diff <= 7) return 4;
  return 5;
}
const bucketTitles = ['Kræver handling', 'Overskredet', 'I dag', 'I morgen', 'Inden for en uge', 'Senere'];

function needs(data) {
  const items = [];
  for (const row of data.registrations?.rows || []) items.push({ kind: 'Fravær', icon: AlertCircle, title: row.text, href: row.href, due: null, urgent: true });
  for (const row of data.assignments?.rows || []) {
    const parsed = parseAssignmentTitle(row.rowTitle);
    items.push({ kind: 'Opgave', icon: ClipboardList, title: parsed.title || row.text, context: parsed.hold, href: row.href, due: row.due, dueText: row.dueText, urgent: row.urgent });
  }
  for (const row of data.homework?.rows || []) {
    const full = (row.detail || row.text).replace(/\s+/g, ' ').trim();
    const i = full.indexOf(':');
    items.push({ kind: 'Lektie', icon: BookOpen, title: (i > 0 ? full.slice(i + 1) : full).replace(/^\s*-\s*/, '').trim(), context: i > 0 ? full.slice(0, i) : '', href: row.href, due: row.due, dueText: row.dueText, urgent: row.urgent, lesson: true });
  }
  return items;
}

function NeedsYou({ data, now }) {
  const items = needs(data);
  const groups = bucketTitles.map((title, i) => ({ title, items: items.filter(item => bucket(item.due, now) === i).sort((a, b) => (a.due?.getTime() || 0) - (b.due?.getTime() || 0)) })).filter(g => g.items.length);
  return <section className="lx-view-section lx-needs" aria-labelledby="lx-needs-title">
    <h2 id="lx-needs-title">Brug for dig</h2>
    {groups.length ? groups.map(group => <div key={group.title} className="lx-needs-group" data-bucket={bucketTitles.indexOf(group.title)}>
      <h3>{group.title} <span className="lx-count">{group.items.length}</span></h3>
      <ul>{group.items.map((item, i) => {
        const Icon = item.icon;
        const late = item.due && item.due < now;
        return <li key={i} className={`lx-need${item.urgent || late ? ' lx-need-urgent' : ''}`}>
          <Icon size={18} aria-hidden="true" className="lx-need-icon" />
          <div className="lx-need-main">
            {item.href ? <a href={item.href} title={item.title}>{item.title}</a> : <strong>{item.title}</strong>}
            <small>{[item.kind, item.context].filter(Boolean).join(' · ')}</small>
          </div>
          {item.due && <div className="lx-need-due">
            <span>{item.lesson ? `Til ${formatDeadline(item.due).replace(/\s\d{2}[.:]\d{2}$/, '')}` : formatDeadline(item.due)}</span>
            {(late || bucket(item.due, now) >= 4) && <small>{late ? 'overskredet' : relativeDay(item.due, now)}</small>}
          </div>}
        </li>;
      })}</ul>
    </div>) : <Empty>Intet kræver din opmærksomhed lige nu.</Empty>}
    <p className="lx-needs-links">
      {data.assignments?.href && <a href={data.assignments.href}>Alle opgaver <ArrowRight size={14} aria-hidden="true" /></a>}
      {data.homework?.href && <a href={data.homework.href}>Alle lektier <ArrowRight size={14} aria-hidden="true" /></a>}
    </p>
  </section>;
}

function Messages({ block }) {
  if (!block) return null;
  const unread = (block.info.match(/(\d+)\s*ulæste/i) || [])[1];
  return <section className="lx-view-section lx-home-messages" aria-labelledby="lx-home-messages">
    <div className="lx-section-head">
      <h2 id="lx-home-messages"><Mail size={18} aria-hidden="true" />Seneste beskeder{unread && <span className="lx-pill lx-pill-alert">{unread} ulæste</span>}</h2>
      {block.href && <a href={block.href}>Alle beskeder <ArrowRight size={14} aria-hidden="true" /></a>}
    </div>
    {block.rows.length ? <ul className="lx-home-list">{block.rows.map((row, i) => <li key={i}>
      {row.href ? <a href={row.href}>{row.text}</a> : <span>{row.text}</span>}
      <span className="lx-home-list-meta" title={row.senderTitle || undefined}>{row.sender}</span>
      <span className="lx-home-list-time">{row.dueText}</span>
    </li>)}</ul> : <Empty>Ingen nye beskeder.</Empty>}
  </section>;
}

function Notices({ block }) {
  if (!block?.rows.length) return null;
  const rows = [...block.rows].sort((a, b) => Number(b.important) - Number(a.important));
  return <section className="lx-view-section lx-notices" aria-labelledby="lx-notices">
    <h2 id="lx-notices"><Megaphone size={18} aria-hidden="true" />{block.title || 'Fra skolen'}</h2>
    <ul>{rows.map((row, i) => <li key={i} className={row.important ? 'lx-notice lx-notice-important' : 'lx-notice'}>
      {row.important && <span className="lx-pill lx-pill-alert">Vigtigt</span>}
      <RichText node={row.node} />
    </li>)}</ul>
  </section>;
}

function Other({ blocks }) {
  if (!blocks.length) return null;
  return <section className="lx-view-section lx-home-other" aria-label="Andet fra Lectio">
    {blocks.map(block => <div key={block.key} className="lx-other-block">
      <h3>{block.href ? <a href={block.href}>{block.title}</a> : block.title}</h3>
      {block.info && <p className="lx-quiet">{block.info}</p>}
      <ul>{block.rows.map((row, i) => <li key={i}>
        {row.href ? <a href={row.href} title={row.text}>{row.text}</a> : <span>{row.text}</span>}
        {row.due && <small>{formatDeadline(row.due)}</small>}
      </li>)}</ul>
    </div>)}
  </section>;
}

function Schedule({ days, now, scheduleHref, groups }) {
  const [today, ...rest] = days;
  const lessonRow = (lesson, i, compact) => {
    const past = lesson.time && lesson.time.end <= now;
    const live = lesson.time && lesson.time.start <= now && now < lesson.time.end;
    const body = <>
      <span className="lx-day-time">{lesson.time ? hm(lesson.time.start) : lesson.module.replace(/\.?\s*modul/i, '.')}</span>
      <span className={`lx-day-lesson lx-fill-${fill(lesson.holds[0])}`}>
        <strong>{lesson.title || lesson.holds.join(', ') || lesson.module}</strong>
        {!compact && <small>{[lesson.title && lesson.holds.join(', '), ...lesson.teachers, lesson.room].filter(Boolean).join(' · ')}</small>}
        {lesson.homework && <BookOpen size={14} aria-label="Lektier" />}
      </span>
    </>;
    return <li key={i} className={`lx-day-row lx-day-${lesson.status}${past ? ' lx-day-past' : ''}${live ? ' lx-day-live' : ''}`}>
      {lesson.href ? <a href={lesson.href}>{body}</a> : <div>{body}</div>}
    </li>;
  };
  return <aside className="lx-home-side" aria-label="Skema og hold">
    {today && <section aria-labelledby="lx-today">
      <div className="lx-section-head"><h2 id="lx-today"><CalendarDays size={18} aria-hidden="true" />{today.label || 'I dag'}</h2><a href={scheduleHref}>Skema <ArrowUpRight size={14} aria-hidden="true" /></a></div>
      {today.lessons.length ? <ol className="lx-day">{today.lessons.map((l, i) => lessonRow(l, i, false))}</ol> : <Empty>Ingen lektioner.</Empty>}
    </section>}
    {rest.map(day => <section key={day.label} className="lx-day-next" aria-label={day.label}>
      <h3>{day.label}</h3>
      <ol className="lx-day lx-day-compact">{day.lessons.map((l, i) => lessonRow(l, i, true))}</ol>
    </section>)}
    {groups.length > 0 && <section className="lx-groups" aria-labelledby="lx-groups"><h3 id="lx-groups">Hold og grupper</h3><p>{groups.map(g => <a key={g.href} href={g.href}>{g.label}</a>)}</p></section>}
  </aside>;
}

export function HomeView({ data, showOriginal }) {
  const now = useNow();
  return <div className="lx-home">
    <div className="lx-home-main">
      <NextLesson days={data.days} now={now} scheduleHref={data.scheduleHref} />
      <NeedsYou data={data} now={now} />
      <Messages block={data.messages} />
      <Notices block={data.notices} />
      <Other blocks={data.other} />
      <p className="lx-home-original"><button type="button" className="lx-view-switch" onClick={showOriginal}>Lectios forside <ArrowUpRight size={16} aria-hidden="true" /></button></p>
    </div>
    <Schedule days={data.days} now={now} scheduleHref={data.scheduleHref} groups={data.groups} />
  </div>;
}
HomeView.contract = contract;
