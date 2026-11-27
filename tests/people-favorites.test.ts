import { describe, expect, it } from 'vitest';
import { favoritesFirst, favoritesOf, isFavorite, parsePersonParam, toggleFavorite, type Favorite } from '@/features/people/favorites';

const anna: Favorite = { kind: 'elev', id: '21', name: 'Anna Andersen', code: '3a' };
const lene: Favorite = { kind: 'laerer', id: '11', name: 'Lene Madsen', code: 'lm' };

describe('people favourites', () => {
  it('toggles by kind and id', () => {
    const list = toggleFavorite([], anna);
    expect(isFavorite(list, 'elev', '21')).toBe(true);
    expect(isFavorite(list, 'laerer', '21')).toBe(false);
    expect(toggleFavorite(list, anna)).toEqual([]);
  });
  it('puts favourites first and keeps the rest in order', () => {
    const entries = [{ kind: 'elev', id: '1' }, { kind: 'elev', id: '21' }, { kind: 'laerer', id: '11' }, { kind: 'elev', id: '2' }];
    expect(favoritesFirst(entries, [anna, lene]).map((e) => e.id)).toEqual(['21', '11', '1', '2']);
    expect(favoritesFirst(entries, [])).toBe(entries);
  });
  it('filters by kind, sorted by name', () => {
    expect(favoritesOf([lene, anna]).map((f) => f.id)).toEqual(['21', '11']);
    expect(favoritesOf([lene, anna], 'laerer')).toEqual([lene]);
  });
  it('reads the ?med= parameter', () => {
    expect(parsePersonParam('elev:123')).toEqual({ kind: 'elev', id: '123' });
    expect(parsePersonParam('laerer:9')).toEqual({ kind: 'laerer', id: '9' });
    expect(parsePersonParam('lokale:9')).toBeNull();
    expect(parsePersonParam(null)).toBeNull();
  });
});
