import { describe, expect, it } from 'vitest';
import { validateDefinition } from '../../src/modules/validation/definitionValidator';
import { isValidRoutePath, routeShape, validateRoutes } from '../../src/modules/validation/routeValidator';
import { fixtureDef, LIMITS, miniDef } from '../helpers';
import { listFixtureNames } from '../../src/fixtures';

const check = (d: unknown) => validateDefinition(d, LIMITS);
const fields = (d: unknown) => check(d).issues.map((i) => i.field);

describe('definition validator', () => {
  it('accepts a valid definition', () => expect(check(miniDef())).toEqual({ valid: true, issues: [] }));
  it.each(listFixtureNames())('accepts bundled fixture %s', (n) => expect(check(fixtureDef(n)).issues).toEqual([]));
  it('rejects non-objects', () => expect(check('nope').valid).toBe(false));
  it('rejects an unknown behavior (never treated as code)', () => {
    const d = miniDef();
    (d.endpoints[0] as { behavior: string }).behavior = 'eval';
    expect(check(d).valid).toBe(false);
  });
  it('rejects unexpected top-level properties', () => expect(check({ ...miniDef(), script: 'process.exit()' }).valid).toBe(false));
  it('rejects unsupported HTTP methods', () => {
    const d = miniDef();
    (d.endpoints[0] as { method: string }).method = 'TRACE';
    expect(check(d).valid).toBe(false);
  });
  it('rejects duplicate endpoint ids', () => {
    const d = miniDef();
    d.endpoints.push({ ...d.endpoints[1]!, path: '/other/:id' });
    expect(check(d).issues.some((i) => i.message.includes('Duplicate endpoint id'))).toBe(true);
  });
  it('rejects conflicting routes', () => {
    const d = miniDef();
    d.endpoints.push({ id: 'dup', method: 'GET', path: '/things/:thingId', behavior: 'getById', resource: 'things' });
    expect(check(d).issues.some((i) => i.message.includes('conflicts'))).toBe(true);
  });
  it('allows a static route next to a parameterized one', () => {
    const d = miniDef();
    d.endpoints.push({ id: 'me', method: 'GET', path: '/things/me', behavior: 'static', response: { body: { me: true } } });
    expect(check(d).valid).toBe(true);
  });
  it('rejects an unknown resource reference', () => {
    const d = miniDef();
    d.endpoints[0]!.resource = 'ghosts';
    expect(fields(d)).toContain('endpoints[0].resource');
  });
  it('requires a resource for non-static behaviors', () => {
    const d = miniDef();
    delete d.endpoints[0]!.resource;
    expect(fields(d)).toContain('endpoints[0].resource');
  });
  it('requires a path parameter for getById/update/delete', () => {
    const d = miniDef();
    d.endpoints[1]!.path = '/thing';
    expect(fields(d)).toContain('endpoints[1].path');
  });
  it('enforces the method required by each behavior', () => {
    const d = miniDef();
    d.endpoints[0]!.method = 'POST';
    expect(fields(d)).toContain('endpoints[0].method');
  });
  it('requires a response for static endpoints', () => {
    const d = miniDef();
    d.endpoints.push({ id: 's', method: 'GET', path: '/s', behavior: 'static' });
    expect(fields(d)).toContain(`endpoints[2].response`);
  });
  it('rejects 204 for behaviors that return a body', () => {
    const d = miniDef();
    d.endpoints[0]!.responseStatus = 204;
    expect(fields(d)).toContain('endpoints[0].responseStatus');
  });
  it('rejects reserved/forbidden field and resource names', () => {
    const d = miniDef();
    d.resources.things!.fields.id = { type: 'string' };
    (d.resources.things!.fields as Record<string, unknown>)['constructor'] = { type: 'string' };
    expect(check(d).issues.length).toBeGreaterThanOrEqual(2);
    const d2 = miniDef({ resources: { constructor: miniDef().resources.things! } });
    d2.endpoints = [{ id: 'x', method: 'GET', path: '/x', behavior: 'list', resource: 'constructor' }];
    expect(check(d2).valid).toBe(false);
  });
  it('rejects min > max and string-only options on numbers', () => {
    const d = miniDef();
    d.resources.things!.fields.qty = { type: 'integer', min: 5, max: 1 };
    d.resources.things!.fields.bad = { type: 'integer', format: 'email' };
    expect(check(d).issues.length).toBeGreaterThanOrEqual(2);
  });
  it('rejects invalid or $ref-using requestSchema', () => {
    const d = miniDef();
    d.endpoints.push({ id: 'p', method: 'POST', path: '/p', behavior: 'static', response: {}, requestSchema: { type: 'wat' } });
    expect(fields(d)).toContain('endpoints[2].requestSchema');
    const d2 = miniDef();
    d2.endpoints.push({ id: 'p', method: 'POST', path: '/p', behavior: 'static', response: {}, requestSchema: { type: 'object', properties: { a: { $ref: 'http://evil.example/x.json' } } } });
    expect(check(d2).issues.some((i) => i.message.includes('$ref'))).toBe(true);
  });
  it('enforces size limits', () => {
    const d = miniDef();
    d.resources.things!.seedCount = 9999;
    expect(fields(d)).toContain('resources.things.seedCount');
    const many = miniDef({ endpoints: Array.from({ length: 51 }, (_, i) => ({ id: `e${i}`, method: 'GET' as const, path: `/p${i}`, behavior: 'list' as const, resource: 'things' })) });
    expect(fields(many)).toContain('endpoints');
  });
  it('validates scope against the path and resource', () => {
    const d = miniDef();
    d.endpoints[0]!.scope = { param: 'nope', field: 'name' };
    expect(fields(d)).toContain('endpoints[0].scope.param');
  });
  it('rejects bad basePath', () => expect(check({ ...miniDef(), basePath: 'api' }).valid).toBe(false));
});

describe('route validator', () => {
  it.each([['/a', true], ['/a/:id', true], ['/', true], ['a', false], ['/a//b', false], ['/a/:', false], ['/a b', false], ['/a/:1x', false]])('isValidRoutePath(%s)=%s', (p, ok) =>
    expect(isValidRoutePath(p as string)).toBe(ok));
  it('routeShape collapses parameters only', () => {
    expect(routeShape('GET', '/a/:x')).toBe(routeShape('GET', '/a/:y'));
    expect(routeShape('GET', '/a/me')).not.toBe(routeShape('GET', '/a/:y'));
  });
  it('flags duplicate parameter names', () =>
    expect(validateRoutes([{ id: 'a', method: 'GET', path: '/a/:x/b/:x', behavior: 'static' }]).length).toBe(1));
});
