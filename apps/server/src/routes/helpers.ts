import Ajv from 'ajv';
import { formatAjvErrors } from '../modules/validation/schemaValidator';
import type { Project } from '../types';
import { validationError } from '../utils/errors';

const ajv = new Ajv({ allErrors: true, strict: true });
const cache = new WeakMap<object, ReturnType<Ajv['compile']>>();

/** Validate a management-API request body against a JSON Schema constant. */
export function parseBody<T>(schema: object, body: unknown): T {
  let v = cache.get(schema);
  if (!v) cache.set(schema, (v = ajv.compile(schema)));
  if (!v(body ?? {})) throw validationError(formatAjvErrors(v.errors));
  return (body ?? {}) as T;
}

export function projectView(p: Project) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    expiresAt: p.expiresAt,
    baseUrl: `/mock/${p.id}${p.definition.basePath}`,
    endpointCount: p.definition.endpoints.length,
    resourceCount: Object.keys(p.definition.resources).length
  };
}
