// The people, classes and groups a new message can go to: the same cached
// lists Lectio's own recipient search loads (see readers/compose.js), fetched
// with the student's session. Each item is
// [title, key, flags, group, cssClass, _, isContextCard, shortName, longName].
import { useEffect, useState } from 'react';

const kinds = { bcteacher: 'Lærer', bcstudent: 'Elev', bchold: 'Hold', bcgroup: 'Gruppe' };
const lists = new Map();

// Lower case without accents, so "Bjørn" is found as "bjørn" and "José" as "jose".
export const fold = value => (value || '').toLocaleLowerCase('da').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function load({ kind, url }) {
  if (!lists.has(url)) {
    lists.set(url, fetch(url, { credentials: 'same-origin' })
      .then(response => { if (!response.ok) throw new Error(`Lectio svarede ${response.status}`); return response.json(); })
      .then(data => (Array.isArray(data?.items) ? data.items : []).filter(item => item?.[0] && item?.[1]).map(([title, key, , , , , , shortName, longName]) => ({
        key: String(key), title: String(title), kind: kinds[kind] || '',
        search: fold([title, shortName, longName].filter(Boolean).join(' ')),
      })))
      .catch(error => { lists.delete(url); throw error; }));
  }
  return lists.get(url);
}

// {status: 'loading' | 'ready' | 'error', items}
export function useDirectory(sources) {
  const key = sources.map(s => s.url).join(' ');
  const [state, setState] = useState({ status: sources.length ? 'loading' : 'error', items: [] });
  useEffect(() => {
    if (!sources.length) return;
    let live = true;
    Promise.allSettled(sources.map(load)).then(results => {
      if (!live) return;
      const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      setState({ status: items.length ? 'ready' : 'error', items });
    });
    return () => { live = false; };
  }, [key]);
  return state;
}

// The best few matches for what was typed: every word must match; a name that
// starts with the first word comes before one that only contains it.
export function searchDirectory(items, query, skip = () => false, limit = 8) {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const found = [];
  for (const item of items) {
    if (!words.every(w => item.search.includes(w)) || skip(item)) continue;
    const rank = item.search.startsWith(words[0]) ? 0 : item.search.split(' ').some(part => part.startsWith(words[0])) ? 1 : 2;
    found.push({ item, rank });
  }
  return found.sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title, 'da')).slice(0, limit).map(f => f.item);
}
