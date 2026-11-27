// Favourite students and teachers: starred locally, shown first in the people
// lists and offered first when comparing schedules.
import { useCallback } from 'react';
import { useLocalItem } from '@/features/schedule/stored';
import { compareText, type DirectoryKind } from './directory';

export type FavoriteKind = Extract<DirectoryKind, 'elev' | 'laerer'>;

export interface Favorite {
  kind: FavoriteKind;
  id: string;
  name: string;
  /** Class ("3a") or initials ("lm"). */
  code: string;
}

export const FAVORITES_KEY = 'peopleFavorites';

export const favoriteKey = (f: { kind: string; id: string }) => `${f.kind}:${f.id}`;

export function isFavorite(list: readonly Favorite[], kind: string, id: string): boolean {
  return list.some((f) => f.kind === kind && f.id === id);
}

/** Adds or removes; adding keeps the newest details (name, class). */
export function toggleFavorite(list: readonly Favorite[], fav: Favorite): Favorite[] {
  return isFavorite(list, fav.kind, fav.id) ? list.filter((f) => !(f.kind === fav.kind && f.id === fav.id)) : [...list, fav];
}

/** Favourites of one kind, by name. */
export function favoritesOf(list: readonly Favorite[], kind?: FavoriteKind): Favorite[] {
  return list.filter((f) => !kind || f.kind === kind).sort((a, b) => compareText(a.name, b.name));
}

/** Stable partition: favourites first, otherwise the order is kept. */
export function favoritesFirst<T extends { kind: string; id: string }>(entries: T[], list: readonly Favorite[]): T[] {
  if (!list.length) return entries;
  const keys = new Set(list.map(favoriteKey));
  const fav: T[] = [];
  const rest: T[] = [];
  for (const e of entries) (keys.has(favoriteKey(e)) ? fav : rest).push(e);
  return [...fav, ...rest];
}

/** "elev:123" → { kind, id } (the ?med= parameter of the schedule). */
export function parsePersonParam(value: string | null | undefined): { kind: FavoriteKind; id: string } | null {
  const m = (value || '').match(/^(elev|laerer):(\d+)$/);
  return m ? { kind: m[1] as FavoriteKind, id: m[2] } : null;
}

export function useFavorites() {
  const [list, setList] = useLocalItem<Favorite[]>(FAVORITES_KEY, []);
  const toggle = useCallback((fav: Favorite) => setList((current) => toggleFavorite(current, fav)), [setList]);
  const has = useCallback((kind: string, id: string) => isFavorite(list, kind, id), [list]);
  return { list, toggle, has };
}
