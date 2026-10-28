import type { MockRecord, ResourceDef } from '../../types';
import { HttpError } from '../../utils/errors';

const SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt'];

export function applySort(records: MockRecord[], res: ResourceDef, query: Record<string, unknown>): MockRecord[] {
  const sort = typeof query.sort === 'string' ? query.sort : undefined;
  const orderRaw = typeof query.order === 'string' ? query.order.toLowerCase() : 'asc';
  if (orderRaw !== 'asc' && orderRaw !== 'desc')
    throw new HttpError(400, 'INVALID_QUERY', 'Invalid query parameter "order".', [{ field: 'order', message: 'Must be "asc" or "desc".' }]);
  if (!sort) return records;
  const allowed = new Set([...(res.sortable ?? Object.keys(res.fields)), ...SYSTEM_FIELDS]);
  if (!allowed.has(sort))
    throw new HttpError(400, 'INVALID_QUERY', 'Invalid query parameter "sort".', [{ field: 'sort', message: `Must be one of: ${[...allowed].join(', ')}.` }]);
  const dir = orderRaw === 'desc' ? -1 : 1;
  return [...records].sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    let c = 0;
    if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
    else if (typeof av === 'boolean' && typeof bv === 'boolean') c = Number(av) - Number(bv);
    else c = String(av ?? '').localeCompare(String(bv ?? ''));
    return c !== 0 ? c * dir : a.id.localeCompare(b.id);
  });
}
