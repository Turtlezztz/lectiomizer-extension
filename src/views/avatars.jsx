// Profile pictures for the people in a message thread. Lectio shows a person's
// photo on their context card; the card is fetched with the student's own
// session, and the photo's address is remembered for the browser session.
import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

const pending = new Map();
const queue = [];
let active = 0;
// A class thread can hold thirty people; don't ask Lectio for all at once.
const PARALLEL = 4;

// Students, teachers and users have photos; classes and groups don't.
export const hasPhoto = id => /^[UST]\d+$/.test(id || '');

const storageKey = (base, id) => `lectiomizer:photo:${base}${id}`;
function remembered(base, id) {
  try { const value = sessionStorage.getItem(storageKey(base, id)); return value === null ? undefined : value || null; } catch { return undefined; }
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

export async function fetchPhoto(base, id) {
  const card = new URL(`contextcard/contextcard.aspx?lectiocontextcard=${encodeURIComponent(id)}`, base);
  // Manifest V3 content scripts fetch in the page's context, with its cookies.
  const response = await fetch(card.href, { credentials: 'same-origin' });
  if (!response.ok) return null;
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const img = Array.from(doc.querySelectorAll('img[src]')).find(el => /GetImage\.aspx\?/i.test(el.getAttribute('src')));
  if (!img) return null;
  const src = new URL(img.getAttribute('src'), card);
  return src.origin === card.origin ? src.href : null;
}

function photoFor(base, id) {
  const key = base + id;
  if (!pending.has(key)) {
    pending.set(key, new Promise(resolve => {
      queue.push(() => fetchPhoto(base, id).catch(() => null).then(url => { remember(base, id, url); resolve(url); }));
      pump();
    }));
  }
  return pending.get(key);
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

export function Avatar({ person, photo, size = 32 }) {
  const [broken, setBroken] = useState(null);
  const group = person.id && !hasPhoto(person.id);
  return <span className="lx-avatar" style={{ '--lx-avatar-size': `${size}px` }} aria-hidden="true">
    {photo && broken !== photo ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(photo)} />
      : group ? <Users size={Math.round(size * .5)} /> : initials(person.name || '?')}
  </span>;
}
