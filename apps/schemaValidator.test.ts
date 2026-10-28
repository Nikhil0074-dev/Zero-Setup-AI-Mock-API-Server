import { describe, expect, it } from 'vitest';
import { compileSchema, SchemaCompileError, validateData } from '../../src/modules/validation/schemaValidator';
import { assertValidBody } from '../../src/modules/validation/requestValidator';
import { buildResourceSchemas } from '../../src/modules/generator/schemaGenerator';
import { HttpError } from '../../src/utils/errors';

const res = { fields: { name: { type: 'string', required: true, minLength: 2 }, year: { type: 'integer', min: 1, max: 4 }, email: { type: 'string', format: 'email' } } } as const;
const schemas = buildResourceSchemas(res as never);

describe('schemaValidator', () => {
  const validate = compileSchema(schemas.create);
  it('accepts a valid body', () => expect(validateData(validate, { name: 'Ann', year: 2 })).toEqual([]));
  it('reports a missing required field with a friendly message', () =>
    expect(validateData(validate, { year: 2 })).toEqual([{ field: 'name', message: 'This field is required.' }]));
  it('reports every problem (allErrors)', () => {
    const fields = validateData(validate, { name: 'A', year: 9, email: 'x' }).map((i) => i.field).sort();
    expect(fields).toEqual(['email', 'name', 'year']);
  });
  it('rejects unknown properties', () => expect(validateData(validate, { name: 'Ann', hack: 1 })).toEqual([{ field: 'hack', message: 'This field is not allowed.' }]));
  it('rejects wrong types', () => expect(validateData(validate, { name: 5 })[0]!.message).toBe('Must be of type string.'));
  it('rejects non-objects', () => expect(validateData(validate, [1]).length).toBeGreaterThan(0));
  it('throws SchemaCompileError on an invalid schema', () => expect(() => compileSchema({ type: 'nonsense' })).toThrow(SchemaCompileError));
  it('rejects unknown keywords in strict mode', () => expect(() => compileSchema({ type: 'object', evil: true })).toThrow(SchemaCompileError));
});

describe('schemaGenerator', () => {
  it('omits "required" from the create schema when no field is required', () => {
    const s = buildResourceSchemas({ fields: { a: { type: 'string' } } });
    expect(s.create).not.toHaveProperty('required');
  });
  it('update schema needs at least one property', () => {
    const v = compileSchema(schemas.update);
    expect(validateData(v, {})[0]!.message).toBe('At least one field must be provided.');
    expect(validateData(v, { year: 3 })).toEqual([]);
  });
  it('resource schema requires id', () => expect((schemas.resource as { required: string[] }).required).toContain('id'));
});

describe('requestValidator', () => {
  const v = compileSchema(schemas.create);
  it('throws a structured 400 on invalid body', () => {
    try {
      assertValidBody(v, { year: 1 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(400);
      expect((e as HttpError).code).toBe('VALIDATION_ERROR');
    }
  });
  it('treats a missing body as {}', () => expect(() => assertValidBody(v, undefined)).toThrow(HttpError));
  it('passes valid bodies', () => expect(() => assertValidBody(v, { name: 'Ann' })).not.toThrow());
});
