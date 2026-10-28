import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { extractJson } from '../../src/utils/json';
import { PROJECT_ID_PATTERN, slugify } from '../../src/utils/ids';
import { addMinutes } from '../../src/utils/dates';
import { listFixtureNames, loadFixture } from '../../src/fixtures';
import { HttpError } from '../../src/utils/errors';

describe('config', () => {
  it('has zero-setup defaults (memory store, no AI key, localhost)', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ port: 4000, host: '127.0.0.1', storeType: 'memory', aiProvider: 'auto', maxPageSize: 100 });
    expect(c.anthropicApiKey).toBeUndefined();
  });
  it('reads overrides', () => expect(loadConfig({ PORT: '5000', STORE: 'redis', MAX_PAGE_SIZE: '20' })).toMatchObject({ port: 5000, storeType: 'redis', maxPageSize: 20 }));
  it('rejects invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ STORE: 'mongo' })).toThrow(/STORE/);
    expect(() => loadConfig({ MAX_PAGE_SIZE: '0' })).toThrow(/MAX_PAGE_SIZE/);
  });
});

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it('parses fenced JSON', () => expect(extractJson('Here:\n```json\n{"a":1}\n```\nDone')).toEqual({ a: 1 }));
  it('finds JSON inside prose', () => expect(extractJson('Sure! {"a":{"b":2}} hope it helps')).toEqual({ a: { b: 2 } }));
  it('throws when there is no JSON', () => expect(() => extractJson('no json here')).toThrow());
});

describe('ids and dates', () => {
  it('slugifies names', () => {
    expect(slugify('Student Management API!')).toBe('student-management-api');
    expect(slugify('***')).toBe('api');
    expect(PROJECT_ID_PATTERN.test(slugify('Ünïcode name'))).toBe(true);
  });
  it('validates project ids', () => {
    expect(PROJECT_ID_PATTERN.test('student-demo')).toBe(true);
    for (const bad of ['A', 'a', '-ab', 'has space', '../x', 'UPPER', 'a'.repeat(50)]) expect(PROJECT_ID_PATTERN.test(bad), bad).toBe(false);
  });
  it('adds minutes', () => expect(addMinutes(new Date('2026-01-01T00:00:00Z'), 90).toISOString()).toBe('2026-01-01T01:30:00.000Z'));
});

describe('fixtures loader', () => {
  it('lists the bundled fixtures', () => expect(listFixtureNames()).toEqual(['ecommerce', 'library', 'students']));
  it('loads one', () => expect((loadFixture('students') as { name: string }).name).toBe('Student Management API'));
  it.each(['../package', '..%2f..%2fetc', 'nope', 'a/b'])('rejects unsafe or unknown fixture name %s', (n) => expect(() => loadFixture(n)).toThrow(HttpError));
});
