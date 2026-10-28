import { describe, expect, it } from 'vitest';
import { applyFilters } from '../../src/modules/data/filtering';
import { paginate, parsePageParams } from '../../src/modules/data/pagination';
import { applySort } from '../../src/modules/data/sorting';
import { HttpError } from '../../src/utils/errors';
import type { MockRecord, ResourceDef } from '../../src/types';

const res: ResourceDef = {
  fields: { name: { type: 'string' }, dept: { type: 'string' }, price: { type: 'number' }, qty: { type: 'integer' }, ok: { type: 'boolean' } },
  filterable: ['dept', 'price', 'qty', 'ok', 'name'],
  sortable: ['name', 'price']
};
const rows: MockRecord[] = [
  { id: 'a', name: 'Bolt', dept: 'Hardware', price: 5, qty: 1, ok: true },
  { id: 'b', name: 'anvil', dept: 'hardware', price: 50, qty: 2, ok: false },
  { id: 'c', name: 'Cake', dept: 'Food', price: 7.5, qty: 3, ok: true }
];
const ids = (r: MockRecord[]) => r.map((x) => x.id);

describe('pagination', () => {
  it('defaults to page 1, limit 10', () => expect(parsePageParams({}, 100)).toEqual({ page: 1, limit: 10 }));
  it('slices and reports metadata', () => {
    const r = paginate(Array.from({ length: 21 }, (_, i) => i), { page: 3, limit: 10 });
    expect(r.data).toEqual([20]);
    expect(r.pagination).toEqual({ page: 3, limit: 10, total: 21, totalPages: 3 });
  });
  it('returns an empty page beyond the end', () => expect(paginate([1, 2], { page: 5, limit: 10 }).data).toEqual([]));
  it('handles empty collections', () => expect(paginate([], { page: 1, limit: 10 }).pagination.totalPages).toBe(0));
  it.each([['page', '0'], ['page', '-1'], ['page', 'abc'], ['limit', '1.5'], ['limit', '101']])('rejects %s=%s', (k, v) =>
    expect(() => parsePageParams({ [k]: v }, 100)).toThrow(HttpError));
  it('clamps the default limit to the server maximum', () => expect(parsePageParams({}, 5).limit).toBe(5));
});

describe('filtering', () => {
  it('filters strings case-insensitively', () => expect(ids(applyFilters(rows, res, { dept: 'HARDWARE' }))).toEqual(['a', 'b']));
  it('filters numbers and booleans with coercion', () => {
    expect(ids(applyFilters(rows, res, { qty: '2' }))).toEqual(['b']);
    expect(ids(applyFilters(rows, res, { ok: 'true' }))).toEqual(['a', 'c']);
  });
  it('supports _min/_max ranges', () => expect(ids(applyFilters(rows, res, { price_min: '6', price_max: '60' }))).toEqual(['b', 'c']));
  it('supports q text search', () => expect(ids(applyFilters(rows, res, { q: 'ca' }))).toEqual(['c']));
  it('combines filters with AND', () => expect(ids(applyFilters(rows, res, { dept: 'hardware', ok: 'true' }))).toEqual(['a']));
  it('ignores unknown and reserved params', () => expect(ids(applyFilters(rows, res, { page: '2', _: '123', nope: 'x' }))).toHaveLength(3));
  it.each([['qty', 'x'], ['ok', 'maybe'], ['price_min', 'abc'], ['qty', '1.5']])('rejects invalid %s=%s', (k, v) =>
    expect(() => applyFilters(rows, res, { [k]: v })).toThrow(HttpError));
  it('rejects filtering on a non-filterable field', () =>
    expect(() => applyFilters(rows, { ...res, filterable: ['dept'] }, { price: '5' })).toThrow(HttpError));
});

describe('sorting', () => {
  it('sorts numbers ascending and descending', () => {
    expect(ids(applySort(rows, res, { sort: 'price' }))).toEqual(['a', 'c', 'b']);
    expect(ids(applySort(rows, res, { sort: 'price', order: 'desc' }))).toEqual(['b', 'c', 'a']);
  });
  it('sorts strings', () => expect(ids(applySort(rows, res, { sort: 'name' }))).toEqual(['b', 'a', 'c']));
  it('allows system fields', () => expect(ids(applySort(rows, res, { sort: 'id', order: 'desc' }))).toEqual(['c', 'b', 'a']));
  it('rejects non-sortable fields and bad order', () => {
    expect(() => applySort(rows, res, { sort: 'qty' })).toThrow(HttpError);
    expect(() => applySort(rows, res, { sort: 'name', order: 'sideways' })).toThrow(HttpError);
  });
  it('leaves order alone without sort and never mutates the input', () => {
    const copy = [...rows];
    applySort(rows, res, { sort: 'price', order: 'desc' });
    expect(rows).toEqual(copy);
    expect(ids(applySort(rows, res, {}))).toEqual(['a', 'b', 'c']);
  });
});
