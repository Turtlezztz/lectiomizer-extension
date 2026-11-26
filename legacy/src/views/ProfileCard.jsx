import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, RefreshCw, X } from 'lucide-react';
import { Avatar, holdsFor, profileFor } from './avatars.jsx';
import { personDetails } from '../readers/profile.js';

// One card shared by the shell and the page's independent React root.
export function ProfileCards() {
  const [selected, setSelected] = useState(null);
  const card = useRef(null);
  const selectedRef = useRef(null);
  useEffect(() => {
    const open = event => {
      const next = event.detail;
      setSelected(current => current?.anchor === next.anchor ? null : next);
    };
    const clear = () => setSelected(null);
    document.addEventListener('lectiomizer:profile', open);
    document.addEventListener('lectiomizer:refresh', clear);
    window.addEventListener('hashchange', clear);
    return () => {
      document.removeEventListener('lectiomizer:profile', open);
      document.removeEventListener('lectiomizer:refresh', clear);
      window.removeEventListener('hashchange', clear);
    };
  }, []);
  useEffect(() => {
    selectedRef.current = selected;
    if (!selected) return;
    const { anchor } = selected;
    anchor.setAttribute('aria-expanded', 'true');
    const close = event => {
      if (card.current?.contains(event.target) || anchor.contains(event.target)) return;
      // Switching avatars is handled by their click, without a focus jump.
      if (event.target.closest?.('.lx-avatar-button')) return;
      setSelected(null);
    };
    const keys = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      setSelected(null); anchor.focus();
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('focusin', close);
    document.addEventListener('keydown', keys, true);
    return () => {
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('focusin', close);
      document.removeEventListener('keydown', keys, true);
    };
  }, [selected]);
  const dismiss = () => { setSelected(null); selectedRef.current?.anchor.focus(); };
  return selected && createPortal(<PersonCard key={`${selected.base}${selected.person.id}`} selected={selected} card={card} dismiss={dismiss} onGone={() => setSelected(null)} />, document.body);
}

function PersonCard({ selected, card, dismiss, onGone }) {
  const { person, photo, base, anchor } = selected;
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const [holds, setHolds] = useState([]);
  const [holdsStatus, setHoldsStatus] = useState('idle');
  const [holdsAttempt, setHoldsAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(null);
  const close = useRef(null);
  useEffect(() => {
    let live = true;
    setStatus('loading');
    profileFor(base, person.id).then(value => { if (live) { setProfile(value); setStatus('ready'); } }, () => { if (live) setStatus('error'); });
    return () => { live = false; };
  }, [base, person.id, attempt]);
  useEffect(() => {
    const schedule = profile?.links.find(link => /\/SkemaNy\.aspx$/i.test(new URL(link.href).pathname));
    if (!schedule || profile.details.some(item => /^hold$/i.test(item.label))) return;
    let live = true;
    setHoldsStatus('loading');
    holdsFor(schedule.href).then(value => { if (live) { setHolds(value); setHoldsStatus('ready'); } }, () => { if (live) setHoldsStatus('error'); });
    return () => { live = false; };
  }, [profile, holdsAttempt]);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) { onGone(); return; }
      const box = anchor.getBoundingClientRect();
      const panel = card.current;
      if (!panel) return;
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const offsetX = viewport?.offsetLeft || 0, offsetY = viewport?.offsetTop || 0;
      const gap = 12;
      panel.style.maxHeight = `${height - gap * 2}px`;
      const size = panel.getBoundingClientRect();
      let left = box.right + gap, top = box.top;
      if (left + size.width > offsetX + width - gap) left = box.left - size.width - gap;
      if (left < offsetX + gap) { left = box.left; top = box.bottom + gap; }
      if (top + size.height > offsetY + height - gap) top = box.top - size.height - gap;
      panel.style.left = `${Math.max(offsetX + gap, Math.min(left, offsetX + width - size.width - gap))}px`;
      panel.style.top = `${Math.max(offsetY + gap, Math.min(top, offsetY + height - size.height - gap))}px`;
    };
    place();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    observer?.observe(card.current);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [anchor, profile, status, holds, holdsStatus]);
  useLayoutEffect(() => { close.current?.focus({ preventScroll: true }); }, [anchor]);
  const name = profile?.name || person.name;
  const details = [...(profile?.details || [])];
  for (const item of personDetails(person)) if (!details.some(existing => existing.label.toLowerCase().replace('stamklasse', 'klasse') === item.label.toLowerCase())) details.push(item);
  const image = profile?.photo || photo;
  const role = profile?.role || (/^S/.test(person.id) ? 'Elev' : /^T/.test(person.id) ? 'Lærer' : '');
  return <section ref={card} id="lx-person-card" className="lx-person-card" role="dialog" aria-labelledby="lx-person-name">
    <button ref={close} type="button" className="lx-person-close" aria-label="Luk profilkort" onClick={dismiss}><X size={18} aria-hidden="true" /></button>
    <div className="lx-person-photo">
      {image && broken !== image ? <img src={image} alt={`Profilbillede af ${name}`} decoding="async" onError={() => setBroken(image)} />
        : <><Avatar person={person} size={72} interactive={false} /><span>Intet profilbillede</span></>}
    </div>
    <div className="lx-person-info">
      <h2 id="lx-person-name">{name}</h2>
      {(role || person.own || person.me) && <p className="lx-person-role">{[role, (person.own || person.me) && 'Dig'].filter(Boolean).join(' · ')}</p>}
      {details.length > 0 && <dl className="lx-person-details">{details.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
      {holds.length > 0 && <div className="lx-person-holds"><h3>Hold og grupper <span>{holds.length}</span></h3><ul>{holds.map(hold => <li key={hold.href}><a href={hold.href}>{hold.name}</a></li>)}</ul></div>}
      {holdsStatus === 'loading' && <p className="lx-person-status" role="status">Henter hold …</p>}
      {holdsStatus === 'error' && <div className="lx-person-status" role="status"><p>Holdene kunne ikke hentes.</p><button type="button" onClick={() => setHoldsAttempt(value => value + 1)}><RefreshCw size={14} aria-hidden="true" /> Prøv igen</button></div>}
      {status === 'loading' && <p className="lx-person-status" role="status">Henter oplysninger …</p>}
      {status === 'error' && <div className="lx-person-status" role="status"><p>Oplysningerne kunne ikke hentes.</p><button type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} aria-hidden="true" /> Prøv igen</button></div>}
      {status === 'ready' && !details.length && !holds.length && holdsStatus !== 'loading' && <p className="lx-person-status">Lectio viser ingen flere oplysninger.</p>}
      {profile?.links.length > 0 && <nav className="lx-person-links" aria-label={`Genveje for ${name}`}>{profile.links.map(link => <a key={link.href} href={link.href}>{link.label}<ArrowUpRight size={14} aria-hidden="true" /></a>)}</nav>}
    </div>
  </section>;
}
