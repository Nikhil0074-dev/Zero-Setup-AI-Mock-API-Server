import type { Config } from '../../config';
import type { MockRecord, Project } from '../../types';
import { applyFilters } from '../data/filtering';
import { paginate, parsePageParams } from '../data/pagination';
import { applySort } from '../data/sorting';
import { assertValidBody } from '../validation/requestValidator';
import type { MockStore } from '../store/store.interface';
import { HttpError } from '../../utils/errors';
import { newRecordId } from '../../utils/ids';
import { buildResponse, type MockResponse } from './responseBuilder';
import type { CompiledApi, CompiledEndpoint } from './routeRegistry';
import { matchRoute, splitPath } from './routeMatcher';
import { resolveSuccessStatus } from './statusCodeResolver';

export interface DispatchInput {
  project: Project;
  api: CompiledApi;
  store: MockStore;
  limits: Pick<Config, 'maxPageSize' | 'maxRecordsPerResource'>;
  method: string;
  /** Path after the `/mock/:projectId` prefix, e.g. `/api/students/stu_101`. */
  path: string;
  query: Record<string, unknown>;
  body: unknown;
  /** Populated with the matched endpoint id so callers can log it even when a handler throws. */
  trace?: { endpointId?: string };
}

interface Ctx extends DispatchInput {
  endpoint: CompiledEndpoint;
  params: Record<string, string>;
}

type Handler = (ctx: Ctx) => Promise<MockResponse>;

const resourceOf = (ctx: Ctx) => ctx.api.definition.resources[ctx.endpoint.def.resource!]!;
const lastParam = (ctx: Ctx): string => {
  const names = Object.keys(ctx.params);
  return ctx.params[names[names.length - 1]!]!;
};
const notFound = (ctx: Ctx, id: string) =>
  new HttpError(404, 'RESOURCE_NOT_FOUND', `${ctx.endpoint.def.resource} "${id}" was not found.`);

/** The fixed allowlist of behaviors. Definitions can only select from this table; they never supply code. */
const HANDLERS: Record<string, Handler> = {
  async list(ctx) {
    const res = resourceOf(ctx);
    const name = ctx.endpoint.def.resource!;
    const scope = ctx.endpoint.def.scope;
    const page = parsePageParams(ctx.query, ctx.limits.maxPageSize);
    let records = await ctx.store.listRecords(ctx.project.id, name);
    if (scope) records = records.filter((r) => String(r[scope.field]) === ctx.params[scope.param]);
    const filtered = applyFilters(records, res, ctx.query);
    const sorted = applySort(filtered, res, ctx.query);
    const result = paginate(sorted, page);
    return buildResponse(resolveSuccessStatus(ctx.endpoint.def), result, { 'x-total-count': String(result.pagination.total) });
  },

  async getById(ctx) {
    const id = lastParam(ctx);
    const rec = await ctx.store.getRecord(ctx.project.id, ctx.endpoint.def.resource!, id);
    if (!rec) throw notFound(ctx, id);
    return buildResponse(resolveSuccessStatus(ctx.endpoint.def), rec);
  },

  async create(ctx) {
    const name = ctx.endpoint.def.resource!;
    assertValidBody(ctx.endpoint.validateBody!, ctx.body);
    if ((await ctx.store.countRecords(ctx.project.id, name)) >= ctx.limits.maxRecordsPerResource)
      throw new HttpError(409, 'LIMIT_EXCEEDED', `This mock environment is limited to ${ctx.limits.maxRecordsPerResource} records per resource.`);
    const now = new Date().toISOString();
    const prefix = resourceOf(ctx).idPrefix ?? name.slice(0, 4).toLowerCase();
    const record = { ...(ctx.body as Record<string, unknown>), id: newRecordId(prefix), createdAt: now, updatedAt: now } as MockRecord;
    await ctx.store.insertRecord(ctx.project.id, name, record);
    return buildResponse(resolveSuccessStatus(ctx.endpoint.def), record);
  },

  async update(ctx) {
    const id = lastParam(ctx);
    assertValidBody(ctx.endpoint.validateBody!, ctx.body);
    const updated = await ctx.store.updateRecord(ctx.project.id, ctx.endpoint.def.resource!, id, {
      ...(ctx.body as Record<string, unknown>),
      updatedAt: new Date().toISOString()
    });
    if (!updated) throw notFound(ctx, id);
    return buildResponse(resolveSuccessStatus(ctx.endpoint.def), updated);
  },

  async delete(ctx) {
    const id = lastParam(ctx);
    if (!(await ctx.store.removeRecord(ctx.project.id, ctx.endpoint.def.resource!, id))) throw notFound(ctx, id);
    return buildResponse(resolveSuccessStatus(ctx.endpoint.def));
  },

  async static(ctx) {
    if (ctx.endpoint.validateBody) assertValidBody(ctx.endpoint.validateBody, ctx.body);
    return buildResponse(resolveSuccessStatus(ctx.endpoint.def), ctx.endpoint.def.response?.body ?? null);
  }
};

export async function dispatch(input: DispatchInput): Promise<MockResponse> {
  const segments = splitPath(input.path);
  const pathMatches: Array<{ endpoint: CompiledEndpoint; params: Record<string, string> }> = [];
  for (const endpoint of input.api.endpoints) {
    const params = matchRoute(endpoint.route, segments);
    if (params) pathMatches.push({ endpoint, params });
  }
  if (pathMatches.length === 0) throw new HttpError(404, 'ROUTE_NOT_FOUND', `No endpoint matches ${input.method} ${input.path}.`);

  const forMethod = pathMatches.filter((m) => m.endpoint.def.method === input.method).sort((a, b) => b.endpoint.route.staticCount - a.endpoint.route.staticCount);
  if (forMethod.length === 0) {
    const allow = [...new Set(pathMatches.map((m) => m.endpoint.def.method))].sort().join(', ');
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${input.method} is not supported on this path. Allowed: ${allow}.`, undefined, { allow });
  }
  const { endpoint, params } = forMethod[0]!;
  if (input.trace) input.trace.endpointId = endpoint.def.id;
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, endpoint.def.behavior) ? HANDLERS[endpoint.def.behavior] : undefined;
  if (!handler) throw new HttpError(500, 'INTERNAL_ERROR', 'Unsupported behavior.');
  const response = await handler({ ...input, endpoint, params });
  return { ...response, headers: { ...response.headers } };
}
