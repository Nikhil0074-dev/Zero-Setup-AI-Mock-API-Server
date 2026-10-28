import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../../src/app';
import { createFixtureProject, makeApp, miniDef } from '../helpers';

let b: BuiltApp;
const j = (r: { body: string }) => JSON.parse(r.body);
const inject = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS', url: string, extra: Record<string, unknown> = {}) => b.app.inject({ method, url, ...extra } as never);
let nowMs = Date.parse('2026-06-01T00:00:00Z');

beforeAll(async () => {
  b = await makeApp({ config: { maxBodyBytes: 2000 }, clock: () => new Date(nowMs) });
  await createFixtureProject(b, 'students', 'student-demo');
  await createFixtureProject(b, 'ecommerce', 'shop');
});
afterAll(() => b.app.close());

describe('error handling', () => {
  it('404 for an unknown project', async () => {
    const r = await inject('GET', '/mock/ghost/api/students');
    expect(r.statusCode).toBe(404);
    expect(j(r).error).toBe('PROJECT_NOT_FOUND');
  });
  it('404 for an unknown route inside a project', async () => expect(j(await inject('GET', '/mock/student-demo/api/teachers')).error).toBe('ROUTE_NOT_FOUND'));
  it('405 with an Allow header when the path exists but the method does not', async () => {
    const r = await inject('PUT', '/mock/student-demo/api/students/stu_101', { payload: { name: 'x' } });
    expect(r.statusCode).toBe(405);
    expect(r.headers.allow).toBe('DELETE, GET, PATCH');
    expect(j(r).error).toBe('METHOD_NOT_ALLOWED');
  });
  it('400 INVALID_JSON for malformed JSON', async () => {
    const r = await inject('POST', '/mock/student-demo/api/students', { headers: { 'content-type': 'application/json' }, payload: '{"name": ' });
    expect(r.statusCode).toBe(400);
    expect(j(r).error).toBe('INVALID_JSON');
  });
  it('treats an empty JSON body on DELETE as no body', async () => {
    const r = await inject('DELETE', '/mock/student-demo/api/students/stu_101', { headers: { 'content-type': 'application/json' }, payload: '' });
    expect(r.statusCode).toBe(204);
  });
  it('413 for oversized bodies', async () => {
    const r = await inject('POST', '/mock/student-demo/api/students', { headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ name: 'x'.repeat(5000) }) });
    expect(r.statusCode).toBe(413);
    expect(j(r).error).toBe('PAYLOAD_TOO_LARGE');
  });
  it('415 for non-JSON content types', async () => {
    const r = await inject('POST', '/mock/student-demo/api/students', { headers: { 'content-type': 'text/plain' }, payload: 'hello' });
    expect(r.statusCode).toBe(415);
  });
  it('400 for malformed percent-encoding', async () => expect((await inject('GET', '/mock/student-demo/api/students/%E0%A4%A')).statusCode).toBe(400));
  it('never leaks stack traces', async () => {
    const r = await inject('GET', '/mock/student-demo/api/students/%E0%A4%A');
    expect(r.body).not.toMatch(/at .*\(.*\)/);
  });
  it('unknown management routes return a JSON 404', async () => {
    const r = await inject('GET', '/api/nothing');
    expect(r.statusCode).toBe(404);
    expect(j(r).error).toBe('NOT_FOUND');
  });
});

describe('environment lifecycle', () => {
  it('returns 503 while deactivated and recovers on activation', async () => {
    await inject('POST', '/api/projects/shop/deactivate');
    const r = await inject('GET', '/mock/shop/api/products');
    expect(r.statusCode).toBe(503);
    expect(j(r).error).toBe('ENVIRONMENT_INACTIVE');
    await inject('POST', '/api/projects/shop/activate');
    expect((await inject('GET', '/mock/shop/api/products')).statusCode).toBe(200);
  });
  it('returns 410 once an environment expires and 404 after the sweep', async () => {
    await b.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'short-lived', name: 's', definition: miniDef(), ttlMinutes: 5 } });
    expect((await inject('GET', '/mock/short-lived/api/things')).statusCode).toBe(200);
    nowMs += 6 * 60_000;
    expect(j(await inject('GET', '/mock/short-lived/api/things')).error).toBe('ENVIRONMENT_EXPIRED');
    await b.projects.sweepExpired();
    expect(j(await inject('GET', '/mock/short-lived/api/things')).error).toBe('PROJECT_NOT_FOUND');
  });
  it('deleting a project removes its routes', async () => {
    await b.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'temp-proj', name: 't', definition: miniDef() } });
    expect((await inject('GET', '/mock/temp-proj/api/things')).statusCode).toBe(200);
    expect((await inject('DELETE', '/api/projects/temp-proj')).statusCode).toBe(204);
    expect((await inject('GET', '/mock/temp-proj/api/things')).statusCode).toBe(404);
  });
  it('reset restores seed data', async () => {
    await inject('POST', '/mock/student-demo/api/students', { payload: { name: 'Temp', email: 't@example.com', department: 'Civil', year: 1 } });
    expect(j(await inject('GET', '/mock/student-demo/api/students')).pagination.total).toBeGreaterThan(23);
    expect((await inject('POST', '/api/projects/student-demo/reset')).statusCode).toBe(200);
    expect(j(await inject('GET', '/mock/student-demo/api/students')).pagination.total).toBe(24);
  });
  it('updating a definition takes effect immediately without a restart', async () => {
    const def = miniDef();
    await inject('POST', '/api/projects', { payload: { id: 'live-edit', name: 'l', definition: def } });
    expect((await inject('POST', '/mock/live-edit/api/things', { payload: { name: 'x' } })).statusCode).toBe(405); // path exists (GET) but POST is not defined yet
    def.endpoints.push({ id: 'create-thing', method: 'POST', path: '/things', behavior: 'create', resource: 'things' });
    expect((await inject('PUT', '/api/projects/live-edit', { payload: { definition: def } })).statusCode).toBe(200);
    expect((await inject('POST', '/mock/live-edit/api/things', { payload: { name: 'x' } })).statusCode).toBe(201);
  });
});

describe('isolation between environments', () => {
  it('data written to one project is invisible to another using the same definition', async () => {
    await inject('POST', '/api/projects', { payload: { id: 'iso-a', name: 'a', fixture: 'students' } });
    await inject('POST', '/api/projects', { payload: { id: 'iso-b', name: 'b', fixture: 'students' } });
    const created = j(await inject('POST', '/mock/iso-a/api/students', { payload: { name: 'Only In A', email: 'a@example.com', department: 'Civil', year: 1 } }));
    expect((await inject('GET', `/mock/iso-a/api/students/${created.id}`)).statusCode).toBe(200);
    expect((await inject('GET', `/mock/iso-b/api/students/${created.id}`)).statusCode).toBe(404);
  });
  it('a project cannot reach another project\'s resources through its own routes', async () => {
    expect((await inject('GET', '/mock/student-demo/api/products')).statusCode).toBe(404);
    expect((await inject('GET', '/mock/shop/api/students')).statusCode).toBe(404);
  });
  it('rejects path traversal-looking project ids safely', async () => {
    const r = await inject('GET', '/mock/..%2F..%2Fetc/api/x');
    expect([400, 404]).toContain(r.statusCode);
  });
  it('rejects prototype-pollution style ids', async () => {
    expect((await inject('GET', '/mock/student-demo/api/students/__proto__')).statusCode).toBe(404);
    expect((await inject('GET', '/mock/student-demo/api/students/constructor')).statusCode).toBe(404);
  });
});

describe('e-commerce scenario (static, nested and scoped endpoints)', () => {
  it('simulated login validates its body and returns the fixed response', async () => {
    const ok = await inject('POST', '/mock/shop/api/auth/login', { payload: { email: 'a@example.com', password: 'pw' } });
    expect(ok.statusCode).toBe(200);
    expect(j(ok)).toMatchObject({ token: 'mock-token', tokenType: 'Bearer' });
    expect((await inject('POST', '/mock/shop/api/auth/login', { payload: { email: 'nope' } })).statusCode).toBe(400);
  });
  it('registration uses the static route /users/register ahead of /users/:id', async () => {
    const r = await inject('POST', '/mock/shop/api/users/register', { payload: { name: 'New User', email: 'new@example.com' } });
    expect(r.statusCode).toBe(201);
    expect(j(r).id).toMatch(/^usr_/);
  });
  it('order history is scoped to the path user', async () => {
    const body = j(await inject('GET', '/mock/shop/api/users/usr_101/orders?limit=100'));
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((o: { userId: string }) => o.userId === 'usr_101')).toBe(true);
  });
  it('creating an order makes it appear in that user\'s history', async () => {
    const before = j(await inject('GET', '/mock/shop/api/users/usr_102/orders')).pagination.total;
    expect((await inject('POST', '/mock/shop/api/orders', { payload: { userId: 'usr_102', total: 99.5, status: 'paid' } })).statusCode).toBe(201);
    expect(j(await inject('GET', '/mock/shop/api/users/usr_102/orders')).pagination.total).toBe(before + 1);
  });
  it('filters products by category and price range', async () => {
    const body = j(await inject('GET', '/mock/shop/api/products?category=books&price_min=10&price_max=2000&limit=100'));
    expect(body.data.every((p: { category: string; price: number }) => p.category === 'books' && p.price >= 10 && p.price <= 2000)).toBe(true);
  });
});

describe('CORS and request logging', () => {
  it('answers preflight requests for browser frontends', async () => {
    const r = await inject('OPTIONS', '/mock/student-demo/api/students', { headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBeTruthy();
  });
  it('logs method/path/status/duration but never bodies, query strings or auth headers', async () => {
    await inject('POST', '/api/projects', { payload: { id: 'log-proj', name: 'l', fixture: 'students' } });
    await inject('GET', '/mock/log-proj/api/students?department=Civil&secret=hunter2', { headers: { authorization: 'Bearer topsecret' } });
    await inject('POST', '/mock/log-proj/api/students', { payload: { name: 'x', password: 'hunter2' } });
    const logs = j(await inject('GET', '/api/projects/log-proj/logs'));
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ method: 'POST', status: 400, endpointId: 'create-student', projectId: 'log-proj' });
    expect(logs[1]).toMatchObject({ method: 'GET', status: 200, path: '/api/students', endpointId: 'list-students' });
    expect(typeof logs[0].durationMs).toBe('number');
    const raw = JSON.stringify(logs);
    for (const secret of ['hunter2', 'topsecret', 'Civil']) expect(raw).not.toContain(secret);
  });
});

describe('concurrency', () => {
  it('50 parallel creates yield 50 distinct stored records', async () => {
    await inject('POST', '/api/projects', { payload: { id: 'conc', name: 'c', fixture: 'students' } });
    const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => inject('POST', '/mock/conc/api/students', { payload: { name: `Student ${i}`, email: `s${i}@example.com`, department: 'Civil', year: 1 } })));
    expect(rs.every((r) => r.statusCode === 201)).toBe(true);
    expect(new Set(rs.map((r) => j(r).id)).size).toBe(50);
    expect(j(await inject('GET', '/mock/conc/api/students')).pagination.total).toBe(74);
  });
  it('parallel PATCHes to different fields of one record are not lost', async () => {
    const id = j(await inject('POST', '/mock/conc/api/students', { payload: { name: 'Race', email: 'r@example.com', department: 'Civil', year: 1 } })).id;
    await Promise.all([
      inject('PATCH', `/mock/conc/api/students/${id}`, { payload: { name: 'Changed' } }),
      inject('PATCH', `/mock/conc/api/students/${id}`, { payload: { year: 4 } }),
      inject('PATCH', `/mock/conc/api/students/${id}`, { payload: { department: 'Mechanical' } })
    ]);
    expect(j(await inject('GET', `/mock/conc/api/students/${id}`))).toMatchObject({ name: 'Changed', year: 4, department: 'Mechanical' });
  });
  it('parallel deletes: exactly one succeeds', async () => {
    const id = j(await inject('POST', '/mock/conc/api/students', { payload: { name: 'Del', email: 'd@example.com', department: 'Civil', year: 1 } })).id;
    const codes = (await Promise.all(Array.from({ length: 5 }, () => inject('DELETE', `/mock/conc/api/students/${id}`)))).map((r) => r.statusCode).sort();
    expect(codes).toEqual([204, 404, 404, 404, 404]);
  });
  it('the record limit holds for sequential creates', async () => {
    const small = await makeApp({ config: { maxRecordsPerResource: 3 } });
    await small.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'cap', name: 'c', definition: { ...miniDef(), endpoints: [...miniDef().endpoints, { id: 'c', method: 'POST', path: '/things', behavior: 'create', resource: 'things' }] } } });
    const r = await small.app.inject({ method: 'POST', url: '/mock/cap/api/things', payload: { name: 'x' } });
    expect(r.statusCode).toBe(409);
    expect(JSON.parse(r.body).error).toBe('LIMIT_EXCEEDED');
    await small.app.close();
  });
});
