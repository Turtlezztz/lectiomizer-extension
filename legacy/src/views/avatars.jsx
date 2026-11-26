// Profile pictures for the people in a message thread. Lectio shows a person's
// photo on their context card; the card is fetched with the student's own
// session, and the photo's address is remembered for the browser session.
import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { readProfile, readProfileHolds } from '../readers/profile.js';
import { fullPhoto, schoolBase } from '../lectio.js';

const pending = new Map();
const queue = [];
let active = 0;
// A class thread can hold thirty people; don't ask Lectio for all at once.
const PARALLEL = 4;

// Students, teachers and users have photos; classes and groups don't.
export const hasPhoto = id => /^[UST]\d+$/.test(id || '');

const storageKey = (base, id) => `lectiomizer:photo:${base}${id}`;
function remembered(base, id) {
  try { const value = sessionStorage.getItem(storageKey(base, id)); return value === null ? undefined : fullPhoto(value) || null; } catch { return undefined; }
}
function remember(base, id, url) {
  try { sessionStorage.setItem(storageKey(base, id), url || ''); } catch {}
}

function pump() {
  while (active < PARALLEL && queue.length) {
    active++;
    queue.shift()().finally(() => { active--; pump(); });
  }
}

export async function fetchProfile(base, id) {
  const card = new URL(`contextcard/contextcard.aspx?lectiocontextcard=${encodeURIComponent(id)}`, base);
  if (!hasPhoto(id) || card.origin !== location.origin) throw new Error('Ukendt person');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(card.href, { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok || (response.url && new URL(response.url).pathname !== card.pathname)) throw new Error('Kortet kunne ikke hentes');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const profile = readProfile(doc, card.href);
    if (!profile.name && !profile.photo && !profile.details.length && !profile.links.length) throw new Error('Kortet er ikke tilgængeligt');
    return profile;
  } finally { clearTimeout(timeout); }
}

export const fetchPhoto = async (base, id) => (await fetchProfile(base, id)).photo;

export function profileFor(base, id) {
  const key = base + id;
  if (!pending.has(key)) {
    const request = new Promise((resolve, reject) => {
      queue.push(() => fetchProfile(base, id).then(profile => { remember(base, id, profile.photo); resolve(profile); }, reject));
      pump();
    });
    pending.set(key, request);
    request.catch(() => { pending.delete(key); });
  }
  return pending.get(key);
}

const photoFor = (base, id) => profileFor(base, id).then(profile => profile.photo).catch(() => null);

const schedules = new Map();
export function holdsFor(href) {
  if (!schedules.has(href)) {
    const request = (async () => {
      const url = new URL(href);
      if (url.origin !== location.origin || !/\/SkemaNy\.aspx$/i.test(url.pathname)) throw new Error('Ukendt skema');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url.href, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok || (response.url && new URL(response.url).pathname !== url.pathname)) throw new Error('Holdene kunne ikke hentes');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (!doc.querySelector('table.s2skema')) throw new Error('Skemaet er ikke tilgængeligt');
        return readProfileHolds(doc, url.href);
      } finally { clearTimeout(timeout); }
    })();
    schedules.set(href, request);
    request.catch(() => schedules.delete(href));
  }
  return schedules.get(href);
}

// {id: url | null} for the given context-card ids; undefined while loading.
export function usePhotos(base, ids, known = {}) {
  const wanted = [...new Set(ids.filter(id => hasPhoto(id) && !(id in known)))];
  const [loaded, setLoaded] = useState({});
  const key = wanted.join(' ');
  useEffect(() => {
    if (!base) return;
    let live = true;
    for (const id of wanted) {
      if (remembered(base, id) !== undefined) continue;
      photoFor(base, id).then(url => { if (live) setLoaded(p => ({ ...p, [id]: url })); });
    }
    return () => { live = false; };
  }, [base, key]);
  const photos = { ...known };
  for (const id of wanted) photos[id] = id in loaded ? loaded[id] : base ? remembered(base, id) : null;
  return photos;
}

const initials = name => name.split(/[\s-]+/).filter(Boolean).filter((_, i, all) => i === 0 || i === all.length - 1).map(part => part[0]).join('').toLocaleUpperCase('da');

export function Avatar({ person, photo, size = 32, interactive = true, base }) {
  const [broken, setBroken] = useState(null);
  const group = person.id && !hasPhoto(person.id);
  const clickable = interactive && hasPhoto(person.id);
  const Tag = clickable ? 'button' : 'span';
  const open = event => {
    event.preventDefault(); event.stopPropagation();
    const anchor = event.currentTarget;
    const root = base || new URL(schoolBase(location.href), location.href).href;
    document.dispatchEvent(new CustomEvent('lectiomizer:profile', { detail: { person, photo, base: root, anchor } }));
  };
  return <Tag className={`lx-avatar${clickable ? ' lx-avatar-button' : ''}`} type={clickable ? 'button' : undefined}
    aria-hidden={clickable ? undefined : true} aria-label={clickable ? `Vis profil for ${person.name}` : undefined}
    aria-haspopup={clickable ? 'dialog' : undefined} aria-controls={clickable ? 'lx-person-card' : undefined}
    onClick={clickable ? open : undefined} style={{ '--lx-avatar-size': `${size}px` }}>
    {photo && broken !== photo ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(photo)} />
      : group ? <Users size={Math.round(size * .5)} /> : initials(person.name || '?')}
  </Tag>;
}
