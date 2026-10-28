import type { ApiDefinition, EndpointDef } from '../../types';
import { paramNames } from '../validation/routeValidator';
import { buildResourceSchemas } from './schemaGenerator';
import { resolveSuccessStatus, HTTP_STATUS_TEXT } from '../runtime/statusCodeResolver';

const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Build an OpenAPI 3.0.3 document for a project. Paths are relative to the server URL (`/mock/<id><basePath>`). */
export function generateOpenApi(projectId: string, def: ApiDefinition): Record<string, unknown> {
  const schemas: Record<string, unknown> = {
    Error: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } }
      },
      required: ['error', 'message']
    },
    Pagination: {
      type: 'object',
      properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } }
    }
  };
  for (const [name, res] of Object.entries(def.resources)) {
    const s = buildResourceSchemas(res);
    const n = cap(name);
    schemas[n] = s.resource;
    schemas[`${n}Create`] = s.create;
    schemas[`${n}Update`] = s.update;
    schemas[`${n}List`] = {
      type: 'object',
      properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${n}` } }, pagination: { $ref: '#/components/schemas/Pagination' } }
    };
  }

  const errorRef = { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  const paths: Record<string, Record<string, unknown>> = {};

  const operation = (ep: EndpointDef) => {
    const status = resolveSuccessStatus(ep);
    const n = ep.resource ? cap(ep.resource) : undefined;
    const parameters: unknown[] = paramNames(ep.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } }));
    const responses: Record<string, unknown> = {};
    const ok: Record<string, unknown> = { description: HTTP_STATUS_TEXT[status] ?? 'Success' };

    if (ep.behavior === 'list' && n) {
      const res = def.resources[ep.resource!]!;
      const filterable = res.filterable ?? Object.keys(res.fields);
      parameters.push(
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, default: 10 } },
        { name: 'sort', in: 'query', schema: { type: 'string' } },
        { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        { name: 'q', in: 'query', description: 'Case-insensitive text search across string fields.', schema: { type: 'string' } },
        ...filterable.map((f) => ({ name: f, in: 'query', schema: { type: res.fields[f]!.type } }))
      );
      ok.content = { 'application/json': { schema: { $ref: `#/components/schemas/${n}List` } } };
    } else if ((ep.behavior === 'getById' || ep.behavior === 'create' || ep.behavior === 'update') && n) {
      ok.content = { 'application/json': { schema: { $ref: `#/components/schemas/${n}` } } };
    } else if (ep.behavior === 'static' && status !== 204) {
      ok.content = { 'application/json': { example: ep.response?.body ?? null } };
    }
    responses[String(status)] = ok;

    const op: Record<string, unknown> = {
      operationId: ep.id,
      summary: ep.summary ?? `${ep.behavior} ${ep.resource ?? ''}`.trim(),
      tags: [ep.resource ?? 'general'],
      parameters,
      responses
    };
    if (ep.behavior === 'create' && n) op.requestBody = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${n}Create` } } } };
    else if (ep.behavior === 'update' && n) op.requestBody = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${n}Update` } } } };
    else if (ep.requestSchema) op.requestBody = { required: true, content: { 'application/json': { schema: ep.requestSchema } } };
    if (op.requestBody || ep.behavior === 'list') responses['400'] = { description: 'Bad Request', ...errorRef };
    if (['getById', 'update', 'delete'].includes(ep.behavior)) responses['404'] = { description: 'Not Found', ...errorRef };
    return op;
  };

  for (const ep of def.endpoints) {
    const p = toOpenApiPath(ep.path);
    (paths[p] ??= {})[ep.method.toLowerCase()] = operation(ep);
  }

  return {
    openapi: '3.0.3',
    info: { title: def.name, version: def.version, description: def.description ?? '' },
    servers: [{ url: `/mock/${projectId}${def.basePath}` }],
    paths,
    components: { schemas }
  };
}
