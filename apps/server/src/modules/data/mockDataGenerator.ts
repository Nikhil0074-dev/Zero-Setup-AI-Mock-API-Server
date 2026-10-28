import type { Faker } from '@faker-js/faker';
import type { FieldDef, MockRecord, ResourceDef } from '../../types';
import { buildResourceSchemas } from '../generator/schemaGenerator';
import { compileSchema } from '../validation/schemaValidator';
import { createFaker, FAKER_GENERATORS, REF_DATE } from './fakerEngine';

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(n: number, def: FieldDef): number {
  const lo = def.min ?? -Infinity;
  const hi = def.max ?? Infinity;
  return Math.min(hi, Math.max(lo, n));
}

function byType(f: Faker, def: FieldDef): string | number | boolean {
  switch (def.type) {
    case 'boolean':
      return f.datatype.boolean();
    case 'integer':
      return f.number.int({ min: def.min ?? 0, max: def.max ?? Math.max(def.min ?? 0, 1000) });
    case 'number': {
      const min = def.min ?? 0;
      const max = def.max ?? Math.max(min, 1000);
      return Number(f.number.float({ min, max, fractionDigits: 2 }));
    }
    default:
      if (def.format === 'email') return f.internet.email({ provider: 'example.com' }).toLowerCase();
      if (def.format === 'date-time') return f.date.recent({ days: 365, refDate: REF_DATE }).toISOString();
      if (def.format === 'date') return f.date.recent({ days: 365, refDate: REF_DATE }).toISOString().slice(0, 10);
      if (def.format === 'uri') return f.internet.url();
      return f.lorem.words(2);
  }
}

function fitString(s: string, def: FieldDef): string {
  let out = s;
  if (def.maxLength !== undefined && out.length > def.maxLength) out = out.slice(0, def.maxLength);
  if (def.minLength !== undefined && out.length < def.minLength) out = out.padEnd(def.minLength, 'x');
  return out;
}

export function generateFieldValue(f: Faker, def: FieldDef): string | number | boolean {
  if (def.enum) return def.enum[f.number.int({ min: 0, max: def.enum.length - 1 })]!;
  const gen = def.faker ? FAKER_GENERATORS[def.faker] : undefined;
  let value = gen ? gen(f, def) : byType(f, def);
  // Coerce generator output to the declared type and constraints.
  if (def.type === 'integer') value = clamp(Math.round(Number(value)), def);
  else if (def.type === 'number') value = clamp(Number(value), def);
  else if (def.type === 'boolean') value = Boolean(value);
  else value = fitString(String(value), def);
  if (typeof value === 'number' && !Number.isFinite(value)) value = def.min ?? 0;
  return value;
}

/**
 * Generate deterministic seed records for a resource. Every record is validated against the
 * resource schema; a record that fails falls back to plain type-based values.
 */
export function generateSeedRecords(name: string, res: ResourceDef, count: number, seed = 1): MockRecord[] {
  const f = createFaker(seed + hashString(name));
  const prefix = res.idPrefix ?? name.slice(0, 4).toLowerCase();
  const validate = compileSchema(buildResourceSchemas(res).resource) as unknown as (d: unknown) => boolean;
  const base = new Date('2026-01-01T00:00:00.000Z').getTime();
  const records: MockRecord[] = [];
  for (let i = 0; i < count; i++) {
    const ts = new Date(base + i * 3_600_000).toISOString();
    const rec: Record<string, unknown> = { id: `${prefix}_${101 + i}` };
    for (const [fname, def] of Object.entries(res.fields)) rec[fname] = generateFieldValue(f, def);
    rec.createdAt = ts;
    rec.updatedAt = ts;
    if (!validate(rec)) {
      for (const [fname, def] of Object.entries(res.fields)) rec[fname] = def.enum ? def.enum[0] : byType(f, def);
    }
    records.push(rec as MockRecord);
  }
  return records;
}
