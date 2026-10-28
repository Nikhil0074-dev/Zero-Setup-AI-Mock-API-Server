import type { FieldDef, ResourceDef } from '../../types';

export interface JsonSchema {
  [k: string]: unknown;
}

export function fieldToSchema(f: FieldDef): JsonSchema {
  const s: JsonSchema = { type: f.type };
  if (f.description) s.description = f.description;
  if (f.enum) s.enum = f.enum;
  if (f.type === 'string') {
    if (f.format) s.format = f.format;
    if (f.minLength !== undefined) s.minLength = f.minLength;
    if (f.maxLength !== undefined) s.maxLength = f.maxLength;
  }
  if (f.type === 'integer' || f.type === 'number') {
    if (f.min !== undefined) s.minimum = f.min;
    if (f.max !== undefined) s.maximum = f.max;
  }
  return s;
}

export interface ResourceSchemas {
  resource: JsonSchema;
  create: JsonSchema;
  update: JsonSchema;
}

/** Deterministically derive the record, create-body and update-body JSON Schemas for a resource. */
export function buildResourceSchemas(res: ResourceDef): ResourceSchemas {
  const fieldProps: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [name, def] of Object.entries(res.fields)) {
    fieldProps[name] = fieldToSchema(def);
    if (def.required) required.push(name);
  }
  return {
    resource: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        ...fieldProps,
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      },
      required: ['id', ...required],
      additionalProperties: false
    },
    create: { type: 'object', properties: fieldProps, ...(required.length ? { required } : {}), additionalProperties: false },
    update: { type: 'object', properties: fieldProps, minProperties: 1, additionalProperties: false }
  };
}
