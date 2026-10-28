import Ajv from 'ajv';
import type { Config } from '../../config';
import { apiDefinitionSchema } from '../../schemas/apiDefinition.schema';
import type { ApiDefinition, ValidationIssue } from '../../types';
import { formatAjvErrors, compileSchema, SchemaCompileError } from './schemaValidator';
import { paramNames, validateRoutes } from './routeValidator';

const structural = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
const validateStructure = structural.compile(apiDefinitionSchema);

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const FORBIDDEN_NAMES = new Set(['constructor', 'prototype', 'proto', 'hasOwnProperty', 'toString', 'valueOf']);
const MAX_REQUEST_SCHEMA_BYTES = 10_000;
const MAX_STATIC_BODY_BYTES = 20_000;

export type DefinitionLimits = Pick<Config, 'maxEndpoints' | 'maxResources' | 'maxSeedCount'>;

export interface DefinitionValidation {
  valid: boolean;
  issues: ValidationIssue[];
}

function containsRef(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRef);
  if (value && typeof value === 'object')
    return Object.entries(value).some(([k, v]) => k === '$ref' || k === '$dynamicRef' || containsRef(v));
  return false;
}

/**
 * Validate an untrusted (e.g. AI-generated) API definition. Nothing is activated unless `valid` is true.
 * Definitions are pure data: the `behavior` field is only ever mapped to an allowlisted handler.
 */
export function validateDefinition(input: unknown, limits: DefinitionLimits): DefinitionValidation {
  if (!validateStructure(input)) return { valid: false, issues: formatAjvErrors(validateStructure.errors) };
  const def = input as unknown as ApiDefinition;
  const issues: ValidationIssue[] = [];

  const resourceNames = Object.keys(def.resources);
  if (resourceNames.length > limits.maxResources) issues.push({ field: 'resources', message: `At most ${limits.maxResources} resources are allowed.` });
  if (def.endpoints.length > limits.maxEndpoints) issues.push({ field: 'endpoints', message: `At most ${limits.maxEndpoints} endpoints are allowed.` });

  for (const [rname, res] of Object.entries(def.resources)) {
    const at = `resources.${rname}`;
    if (!NAME.test(rname) || FORBIDDEN_NAMES.has(rname)) issues.push({ field: at, message: 'Invalid resource name.' });
    if ((res.seedCount ?? 0) > limits.maxSeedCount) issues.push({ field: `${at}.seedCount`, message: `seedCount may not exceed ${limits.maxSeedCount}.` });
    const fieldNames = Object.keys(res.fields);
    for (const [fname, f] of Object.entries(res.fields)) {
      if (!NAME.test(fname) || FORBIDDEN_NAMES.has(fname) || ['id', 'createdAt', 'updatedAt'].includes(fname))
        issues.push({ field: `${at}.fields.${fname}`, message: 'Invalid or reserved field name.' });
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) issues.push({ field: `${at}.fields.${fname}`, message: 'min may not exceed max.' });
      if (f.minLength !== undefined && f.maxLength !== undefined && f.minLength > f.maxLength)
        issues.push({ field: `${at}.fields.${fname}`, message: 'minLength may not exceed maxLength.' });
      if (f.type !== 'string' && (f.format || f.minLength !== undefined || f.maxLength !== undefined))
        issues.push({ field: `${at}.fields.${fname}`, message: 'format/minLength/maxLength apply to strings only.' });
      if ((f.type === 'string' || f.type === 'boolean') && (f.min !== undefined || f.max !== undefined))
        issues.push({ field: `${at}.fields.${fname}`, message: 'min/max apply to numeric fields only.' });
    }
    for (const key of ['filterable', 'sortable'] as const)
      for (const f of res[key] ?? [])
        if (!fieldNames.includes(f) && !(key === 'sortable' && ['id', 'createdAt', 'updatedAt'].includes(f)))
          issues.push({ field: `${at}.${key}`, message: `Unknown field "${f}".` });
  }

  issues.push(...validateRoutes(def.endpoints));

  def.endpoints.forEach((ep, i) => {
    const at = `endpoints[${i}]`;
    const params = paramNames(ep.path);
    if (ep.behavior === 'static') {
      if (!ep.response) issues.push({ field: `${at}.response`, message: 'Static endpoints require a response.' });
      else if (JSON.stringify(ep.response.body ?? null).length > MAX_STATIC_BODY_BYTES)
        issues.push({ field: `${at}.response`, message: 'Static response body is too large.' });
      if (ep.resource) issues.push({ field: `${at}.resource`, message: 'Static endpoints must not reference a resource.' });
    } else {
      if (!ep.resource) issues.push({ field: `${at}.resource`, message: `Behavior "${ep.behavior}" requires a resource.` });
      else if (!def.resources[ep.resource]) issues.push({ field: `${at}.resource`, message: `Unknown resource "${ep.resource}".` });
      if (ep.response) issues.push({ field: `${at}.response`, message: 'Only static endpoints may define a fixed response.' });
    }
    if (['getById', 'update', 'delete'].includes(ep.behavior) && params.length === 0)
      issues.push({ field: `${at}.path`, message: `Behavior "${ep.behavior}" requires a path parameter such as :id.` });
    const expectedMethods: Record<string, string[]> = {
      list: ['GET'],
      getById: ['GET'],
      create: ['POST'],
      update: ['PUT', 'PATCH'],
      delete: ['DELETE']
    };
    const allowed = expectedMethods[ep.behavior];
    if (allowed && !allowed.includes(ep.method)) issues.push({ field: `${at}.method`, message: `Behavior "${ep.behavior}" requires method ${allowed.join(' or ')}.` });
    if (ep.scope) {
      if (ep.behavior !== 'list') issues.push({ field: `${at}.scope`, message: 'scope is only supported for list endpoints.' });
      if (!params.includes(ep.scope.param)) issues.push({ field: `${at}.scope.param`, message: `Path has no parameter ":${ep.scope.param}".` });
      const res = ep.resource ? def.resources[ep.resource] : undefined;
      if (res && !(ep.scope.field in res.fields)) issues.push({ field: `${at}.scope.field`, message: `Unknown field "${ep.scope.field}".` });
    }
    if (ep.responseStatus !== undefined && ep.responseStatus === 204 && ['list', 'getById', 'create'].includes(ep.behavior))
      issues.push({ field: `${at}.responseStatus`, message: '204 cannot be used for behaviors that return a body.' });
    if (ep.requestSchema) {
      if (JSON.stringify(ep.requestSchema).length > MAX_REQUEST_SCHEMA_BYTES) issues.push({ field: `${at}.requestSchema`, message: 'requestSchema is too large.' });
      else if (containsRef(ep.requestSchema)) issues.push({ field: `${at}.requestSchema`, message: '$ref is not supported in requestSchema.' });
      else {
        try {
          compileSchema(ep.requestSchema);
        } catch (e) {
          issues.push({ field: `${at}.requestSchema`, message: `Invalid JSON Schema: ${e instanceof SchemaCompileError ? e.message : 'compile error'}` });
        }
      }
    }
  });

  return { valid: issues.length === 0, issues };
}
