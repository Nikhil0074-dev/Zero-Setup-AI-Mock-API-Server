import type { MockRecord, ResourceDef } from '../../types';
import { HttpError } from '../../utils/errors';

export const RESERVED_PARAMS = new Set(['page', 'limit', 'sort', 'order', 'q']);

function bad(field: string, message: string): HttpError {
  return new HttpError(400, 'INVALID_QUERY', `Invalid query parameter "${field}".`, [{ field, message }]);
}

type Predicate = (r: MockRecord) => boolean;

/**
 * Build a predicate from query parameters:
 *  - `<field>=value` exact match (case-insensitive for strings)
 *  - `<field>_min` / `<field>_max` inclusive range for numeric fields
 *  - `q=text` case-insensitive substring search across string fields
 * Unknown parameters are ignored so clients may add cache-busters.
 */
export function buildFilter(res: ResourceDef, query: Record<string, unknown>): Predicate {
  const filterable = new Set(res.filterable ?? Object.keys(res.fields));
  const preds: Predicate[] = [];

  for (const [key, raw] of Object.entries(query)) {
    if (RESERVED_PARAMS.has(key) || raw === undefined) continue;
    const value = Array.isArray(raw) ? String(raw[0]) : String(raw);
    const range = /^(.+)_(min|max)$/.exec(key);
    const rangeField = range && res.fields[range[1]!] && (res.fields[range[1]!]!.type === 'integer' || res.fields[range[1]!]!.type === 'number') ? range : null;
    const fieldName = rangeField ? rangeField[1]! : key;
    const def = Object.prototype.hasOwnProperty.call(res.fields, fieldName) ? res.fields[fieldName] : undefined;
    if (!def) continue;
    if (!filterable.has(fieldName)) throw bad(key, 'This field cannot be filtered.');

    if (rangeField) {
      const n = Number(value);
      if (value === '' || !Number.isFinite(n)) throw bad(key, 'Must be a number.');
      preds.push(rangeField[2] === 'min' ? (r) => Number(r[fieldName]) >= n : (r) => Number(r[fieldName]) <= n);
      continue;
    }
    if (def.type === 'integer' || def.type === 'number') {
      const n = Number(value);
      if (value === '' || !Number.isFinite(n) || (def.type === 'integer' && !Number.isInteger(n))) throw bad(key, `Must be ${def.type === 'integer' ? 'an integer' : 'a number'}.`);
      preds.push((r) => r[fieldName] === n);
    } else if (def.type === 'boolean') {
      if (value !== 'true' && value !== 'false') throw bad(key, 'Must be "true" or "false".');
      const b = value === 'true';
      preds.push((r) => r[fieldName] === b);
    } else {
      const v = value.toLowerCase();
      preds.push((r) => String(r[fieldName] ?? '').toLowerCase() === v);
    }
  }

  const q = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
  if (q) {
    const stringFields = Object.entries(res.fields).filter(([, d]) => d.type === 'string').map(([n]) => n);
    preds.push((r) => stringFields.some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
  }
  return (r) => preds.every((p) => p(r));
}

export function applyFilters(records: MockRecord[], res: ResourceDef, query: Record<string, unknown>): MockRecord[] {
  const pred = buildFilter(res, query);
  return records.filter(pred);
}
