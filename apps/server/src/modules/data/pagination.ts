import { HttpError } from '../../utils/errors';

export interface PageParams {
  page: number;
  limit: number;
}

export interface PaginationMeta extends PageParams {
  total: number;
  totalPages: number;
}

function parsePositiveInt(raw: unknown, name: string, def: number): number {
  if (raw === undefined || raw === '') return def;
  const s = String(raw);
  if (!/^\d+$/.test(s) || Number(s) < 1) throw new HttpError(400, 'INVALID_QUERY', `Invalid query parameter "${name}".`, [{ field: name, message: 'Must be a positive integer.' }]);
  return Number(s);
}

export function parsePageParams(query: Record<string, unknown>, maxPageSize: number, defaultLimit = 10): PageParams {
  const page = parsePositiveInt(query.page, 'page', 1);
  const limit = parsePositiveInt(query.limit, 'limit', Math.min(defaultLimit, maxPageSize));
  if (limit > maxPageSize)
    throw new HttpError(400, 'INVALID_QUERY', `Invalid query parameter "limit".`, [{ field: 'limit', message: `Must be at most ${maxPageSize}.` }]);
  return { page, limit };
}

export function paginate<T>(items: T[], { page, limit }: PageParams): { data: T[]; pagination: PaginationMeta } {
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}
