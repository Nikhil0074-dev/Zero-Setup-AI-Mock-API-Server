import { describe, expect, it } from 'vitest';
import { generateFieldValue, generateSeedRecords } from '../../src/modules/data/mockDataGenerator';
import { createFaker, FAKER_GENERATORS } from '../../src/modules/data/fakerEngine';
import { buildResourceSchemas } from '../../src/modules/generator/schemaGenerator';
import { compileSchema } from '../../src/modules/validation/schemaValidator';
import { listFixtureNames } from '../../src/fixtures';
import { fixtureDef } from '../helpers';
import type { ResourceDef } from '../../src/types';

const res: ResourceDef = {
  idPrefix: 'stu',
  fields: {
    name: { type: 'string', required: true, faker: 'person.fullName', minLength: 2, maxLength: 12 },
    email: { type: 'string', format: 'email' },
    dept: { type: 'string', enum: ['A', 'B'] },
    year: { type: 'integer', min: 1, max: 4 },
    price: { type: 'number', min: 10, max: 20, faker: 'commerce.price' },
    ok: { type: 'boolean' },
    when: { type: 'string', format: 'date-time' },
    unknownGen: { type: 'string', faker: 'does.notExist' }
  }
};

describe('mock data generator', () => {
  const records = generateSeedRecords('students', res, 50, 1);
  it('creates the requested number of records with sequential ids', () => {
    expect(records).toHaveLength(50);
    expect(records[0]!.id).toBe('stu_101');
    expect(new Set(records.map((r) => r.id)).size).toBe(50);
  });
  it('every record satisfies the resource schema', () => {
    const v = compileSchema(buildResourceSchemas(res).resource);
    for (const r of records) expect(v(r), JSON.stringify(v.errors)).toBe(true);
  });
  it('respects constraints', () => {
    for (const r of records) {
      expect(['A', 'B']).toContain(r.dept);
      expect(r.year as number).toBeGreaterThanOrEqual(1);
      expect(r.year as number).toBeLessThanOrEqual(4);
      expect(r.price as number).toBeGreaterThanOrEqual(10);
      expect(r.price as number).toBeLessThanOrEqual(20);
      expect((r.name as string).length).toBeLessThanOrEqual(12);
      expect(r.email as string).toMatch(/^[^@\s]+@example\.com$/);
    }
  });
  it('is deterministic for a given seed and differs across seeds', () => {
    expect(generateSeedRecords('students', res, 5, 1)).toEqual(generateSeedRecords('students', res, 5, 1));
    expect(generateSeedRecords('students', res, 5, 2)).not.toEqual(generateSeedRecords('students', res, 5, 1));
  });
  it('supports zero records', () => expect(generateSeedRecords('x', res, 0)).toEqual([]));
  it('every allowlisted generator returns a primitive', () => {
    const f = createFaker(1);
    for (const [k, fn] of Object.entries(FAKER_GENERATORS)) expect(['string', 'number', 'boolean'], k).toContain(typeof fn(f, { type: 'string' }));
  });
  it('pads strings shorter than minLength', () => expect(generateFieldValue(createFaker(1), { type: 'string', minLength: 30, faker: 'person.firstName' })).toHaveLength(30));
  it.each(listFixtureNames())('fixture %s seeds records that satisfy their schemas', (n) => {
    const def = fixtureDef(n);
    for (const [rn, r] of Object.entries(def.resources)) {
      const v = compileSchema(buildResourceSchemas(r).resource);
      for (const rec of generateSeedRecords(rn, r, r.seedCount ?? 10, def.seed)) expect(v(rec), `${rn}: ${JSON.stringify(v.errors)}`).toBe(true);
    }
  });
});
