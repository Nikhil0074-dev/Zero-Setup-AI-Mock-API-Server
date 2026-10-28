import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { ValidationIssue } from '../../types';

const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictTuples: false, allowUnionTypes: true });
addFormats(ajv);

export class SchemaCompileError extends Error {}

/** Compile a JSON Schema. The shared Ajv instance does not retain it, so long-running servers do not leak. */
export function compileSchema(schema: object): ValidateFunction {
  try {
    const validate = ajv.compile(schema);
    ajv.removeSchema(schema);
    return validate;
  } catch (err) {
    throw new SchemaCompileError(err instanceof Error ? err.message : String(err));
  }
}

function toField(e: ErrorObject): string {
  const base = e.instancePath.replace(/^\//, '').replace(/\//g, '.');
  const p = e.params as Record<string, unknown>;
  if (e.keyword === 'required' && typeof p.missingProperty === 'string') return base ? `${base}.${p.missingProperty}` : p.missingProperty;
  if (e.keyword === 'additionalProperties' && typeof p.additionalProperty === 'string')
    return base ? `${base}.${p.additionalProperty}` : p.additionalProperty;
  return base || '(root)';
}

function toMessage(e: ErrorObject): string {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required':
      return 'This field is required.';
    case 'additionalProperties':
      return 'This field is not allowed.';
    case 'type':
      return `Must be of type ${String(p.type)}.`;
    case 'enum':
      return `Must be one of: ${(p.allowedValues as unknown[]).join(', ')}.`;
    case 'minimum':
    case 'maximum':
      return `Must be ${e.keyword === 'minimum' ? '>=' : '<='} ${String(p.limit)}.`;
    case 'minLength':
    case 'maxLength':
      return `Length must be ${e.keyword === 'minLength' ? 'at least' : 'at most'} ${String(p.limit)} characters.`;
    case 'format':
      return `Must be a valid ${String(p.format)}.`;
    case 'minProperties':
      return 'At least one field must be provided.';
    default:
      return e.message ?? 'Invalid value.';
  }
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((e) => ({ field: toField(e), message: toMessage(e) }));
}

/** Returns an empty array when the data is valid. */
export function validateData(validate: ValidateFunction, data: unknown): ValidationIssue[] {
  return validate(data) ? [] : formatAjvErrors(validate.errors);
}
