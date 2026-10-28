import RedisMock from 'ioredis-mock';
import SwaggerParser from '@apidevtools/swagger-parser';
import { afterAll, describe, expect, it } from 'vitest';
import type { AiProvider } from '../../src/modules/ai/aiClient';
import { AiProviderError } from '../../src/modules/ai/aiClient';
import { RedisStore, type RedisLike } from '../../src/modules/store/redisStore';
import { listFixtureNames } from '../../src/fixtures';
import { createFixtureProject, makeApp, miniDef } from '../helpers';

const j = (r: { body: string }) => JSON.parse(r.body);
const apps: Array<{ close(): Promise<unknown> }> = [];
const make = async (...a: Parameters<typeof makeApp>) => {
  const b = await makeApp(...a);
  apps.push(b.app);
  return b;
};
afterAll(() => Promise.all(apps.map((a) => a.close())));

describe('health and dashboard', () => {
  it('GET /health', async () => {
    const b = await make();
    const r = await b.app.inject('/health');
    expect(r.statusCode).toBe(200);
    expect(j(r)).toMatchObject({ status: 'ok', aiProvider: 'rule-based', store: 'memory' });
  });
  it('serves the dashboard at /', async () => {
    const b = await make();
    const r = await b.app.inject('/');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
  });
});

describe('project management API', () => {
  it('create → list → get → update → delete', async () => {
    const b = await make();
    const c = await b.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Student Management API', description: 'd', fixture: 'students' } });
    expect(c.statusCode).toBe(201);
    const p = j(c);
    expect(p).toMatchObject({ status: 'active', endpointCount: 5, resourceCount: 1 });
    expect(p.baseUrl).toBe(`/mock/${p.id}/api`);
    expect(j(await b.app.inject('/api/projects'))).toHaveLength(1);
    const g = j(await b.app.inject(`/api/projects/${p.id}`));
    expect(g.definition.resources.students).toBeTruthy();
    const u = await b.app.inject({ method: 'PUT', url: `/api/projects/${p.id}`, payload: { name: 'Renamed' } });
    expect(j(u).name).toBe('Renamed');
    expect((await b.app.inject({ method: 'DELETE', url: `/api/projects/${p.id}` })).statusCode).toBe(204);
    expect((await b.app.inject(`/api/projects/${p.id}`)).statusCode).toBe(404);
  });
  it('requires exactly one of definition / fixture / prompt', async () => {
    const b = await make();
    for (const payload of [{ name: 'x' }, { name: 'x', fixture: 'students', prompt: 'students' }]) {
      const r = await b.app.inject({ method: 'POST', url: '/api/projects', payload });
      expect(r.statusCode).toBe(400);
    }
  });
  it('rejects unknown fixtures, unknown body properties and invalid definitions', async () => {
    const b = await make();
    expect((await b.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'x', fixture: '../../etc/passwd' } })).statusCode).toBe(404);
    expect((await b.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'x', fixture: 'students', evil: true } })).statusCode).toBe(400);
    const bad = await b.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'x', definition: { name: 'x' } } });
    expect(bad.statusCode).toBe(422);
    expect(j(bad).error).toBe('INVALID_DEFINITION');
    expect(j(bad).details.length).toBeGreaterThan(0);
  });
  it('409 on a duplicate id', async () => {
    const b = await make();
    await createFixtureProject(b, 'students', 'dup');
    expect((await b.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'dup', name: 'x', fixture: 'students' } })).statusCode).toBe(409);
  });
  it('lists endpoints with full URLs and path params', async () => {
    const b = await make();
    await createFixtureProject(b, 'students', 'ep');
    const eps = j(await b.app.inject('/api/projects/ep/endpoints'));
    expect(eps).toHaveLength(5);
    expect(eps.find((e: { id: string }) => e.id === 'get-student')).toMatchObject({ url: '/mock/ep/api/students/:id', pathParams: ['id'], expectedStatus: 200 });
    expect(eps.find((e: { id: string }) => e.id === 'delete-student').expectedStatus).toBe(204);
  });
  it('exposes generated JSON schemas', async () => {
    const b = await make();
    await createFixtureProject(b, 'students', 'sc');
    const s = j(await b.app.inject('/api/projects/sc/schemas'));
    expect(s.students.create.required).toEqual(['name', 'email', 'department', 'year']);
  });
  it('exports the definition and a valid OpenAPI document (GET and POST)', async () => {
    const b = await make();
    await createFixtureProject(b, 'ecommerce', 'ex');
    const def = j(await b.app.inject({ method: 'POST', url: '/api/projects/ex/export', payload: {} }));
    expect(def.name).toBe('E-Commerce API');
    const oa = j(await b.app.inject({ method: 'POST', url: '/api/projects/ex/export', payload: { format: 'openapi' } }));
    await SwaggerParser.validate(oa);
    expect(j(await b.app.inject('/api/projects/ex/export?format=openapi')).openapi).toBe('3.0.3');
    expect((await b.app.inject({ method: 'POST', url: '/api/projects/ex/export', payload: { format: 'yaml' } })).statusCode).toBe(400);
  });
  it('404s for management operations on unknown projects', async () => {
    const b = await make();
    for (const [m, u] of [['GET', '/api/projects/x/endpoints'], ['POST', '/api/projects/x/reset'], ['GET', '/api/projects/x/logs'], ['POST', '/api/projects/x/activate']] as const)
      expect((await b.app.inject({ method: m, url: u })).statusCode, u).toBe(404);
  });
});

describe('AI generation endpoint (mocked provider)', () => {
  const provider = (text: string | Error): AiProvider => ({ name: 'mock-ai', generate: async () => { if (text instanceof Error) throw text; return text; } });

  it('generates, validates and returns a definition with schemas', async () => {
    const b = await make({ aiProvider: provider(JSON.stringify(miniDef())) });
    const r = await b.app.inject({ method: 'POST', url: '/api/generate', payload: { name: 'Things', description: 'an API for things' } });
    expect(r.statusCode).toBe(200);
    expect(j(r)).toMatchObject({ provider: 'mock-ai', attempts: 1 });
    expect(j(r).schemas.things.create).toBeTruthy();
  });
  it('generate → create project from prompt → serve it', async () => {
    const b = await make({ aiProvider: provider(JSON.stringify(miniDef())) });
    const c = await b.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'from-ai', name: 'AI', prompt: 'things please' } });
    expect(c.statusCode).toBe(201);
    expect(j(await b.app.inject('/mock/from-ai/api/things')).pagination.total).toBe(3);
  });
  it('works fully offline with the built-in rule-based provider', async () => {
    const b = await make();
    const r = await b.app.inject({ method: 'POST', url: '/api/generate', payload: { description: 'Student management API with students' } });
    expect(j(r).provider).toBe('rule-based');
    const c = await b.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'offline', name: 'o', definition: j(r).definition } });
    expect(c.statusCode).toBe(201);
    expect((await b.app.inject('/mock/offline/api/students')).statusCode).toBe(200);
  });
  it('validates the generate request body', async () => {
    const b = await make();
    expect((await b.app.inject({ method: 'POST', url: '/api/generate', payload: {} })).statusCode).toBe(400);
    expect((await b.app.inject({ method: 'POST', url: '/api/generate', payload: { description: 'x'.repeat(5000) } })).statusCode).toBe(400);
  });
  it('422 when the model returns garbage; nothing is activated', async () => {
    const b = await make({ aiProvider: provider('not json at all') });
    const r = await b.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'x', prompt: 'things' } });
    expect(r.statusCode).toBe(422);
    expect(j(await b.app.inject('/api/projects'))).toEqual([]);
  });
  it('504 on provider timeout, 502 on provider failure', async () => {
    const t = await make({ aiProvider: provider(new AiProviderError('slow', 'timeout')) });
    expect((await t.app.inject({ method: 'POST', url: '/api/generate', payload: { description: 'things' } })).statusCode).toBe(504);
    const f = await make({ aiProvider: provider(new AiProviderError('x', 'http')) });
    expect((await f.app.inject({ method: 'POST', url: '/api/generate', payload: { description: 'things' } })).statusCode).toBe(502);
  });
  it('lists and returns fixtures', async () => {
    const b = await make();
    expect(j(await b.app.inject('/api/fixtures')).map((f: { name: string }) => f.name)).toEqual(['ecommerce', 'library', 'students']);
    expect(j(await b.app.inject('/api/fixtures/library')).name).toBe('Library API');
    expect((await b.app.inject('/api/fixtures/nope')).statusCode).toBe(404);
  });
});

describe('security controls', () => {
  it('ADMIN_TOKEN protects /api/* but not /health, the dashboard or mock endpoints', async () => {
    const b = await make({ config: { adminToken: 's3cret' } });
    expect((await b.app.inject('/api/projects')).statusCode).toBe(401);
    expect((await b.app.inject({ url: '/api/projects', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await b.app.inject({ url: '/api/projects', headers: { authorization: 's3cret' } })).statusCode).toBe(401);
    const auth = { authorization: 'Bearer s3cret' };
    const c = await b.app.inject({ method: 'POST', url: '/api/projects', headers: auth, payload: { id: 'sec', name: 's', fixture: 'students' } });
    expect(c.statusCode).toBe(201);
    expect((await b.app.inject('/health')).statusCode).toBe(200);
    expect((await b.app.inject('/')).statusCode).toBe(200);
    expect((await b.app.inject('/mock/sec/api/students')).statusCode).toBe(200);
    expect(j(await b.app.inject('/api/projects')).error).toBe('UNAUTHORIZED');
  });
  it('rate-limits /api/generate with 429 and Retry-After', async () => {
    const b = await make({ config: { generateRatePerMinute: 2 } });
    const codes: number[] = [];
    let last: { headers: Record<string, unknown> } | undefined;
    for (let i = 0; i < 4; i++) {
      const r = await b.app.inject({ method: 'POST', url: '/api/generate', payload: { description: 'students' } });
      codes.push(r.statusCode);
      last = r;
    }
    expect(codes).toEqual([200, 200, 429, 429]);
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
  });
  it('rate-limits mock traffic', async () => {
    const b = await make({ config: { mockRatePerMinute: 3 } });
    await createFixtureProject(b, 'students', 'rl');
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await b.app.inject('/mock/rl/api/students')).statusCode);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
  it('enforces the project limit and the generated-definition size limits', async () => {
    const b = await make({ config: { maxProjects: 1, maxEndpoints: 3 } });
    expect((await b.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'x', fixture: 'students' } })).statusCode).toBe(422); // 5 endpoints > 3
    expect((await b.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'one', name: 'x', definition: miniDef() } })).statusCode).toBe(201);
    expect((await b.app.inject({ method: 'POST', url: '/api/projects', payload: { id: 'two', name: 'x', definition: miniDef() } })).statusCode).toBe(409);
  });
  it('returns a generic 500 without internals when the store fails', async () => {
    const b = await make();
    await createFixtureProject(b, 'students', 'boom');
    b.store.listRecords = async () => { throw new Error('db password=hunter2 at /srv/secret.ts'); };
    const r = await b.app.inject('/mock/boom/api/students');
    expect(r.statusCode).toBe(500);
    expect(j(r)).toEqual({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
    expect(r.body).not.toContain('hunter2');
  });
  it('a logging failure never breaks a mock request', async () => {
    const b = await make();
    await createFixtureProject(b, 'students', 'nolog');
    b.store.appendLog = async () => { throw new Error('log sink down'); };
    expect((await b.app.inject('/mock/nolog/api/students')).statusCode).toBe(200);
  });
});

describe.each(listFixtureNames())('fixture %s end-to-end', (name) => {
  it('every GET endpoint without path params returns 200 with data; every OpenAPI doc validates', async () => {
    const b = await make();
    await createFixtureProject(b, name, 'fx');
    const eps = j(await b.app.inject('/api/projects/fx/endpoints')) as Array<{ method: string; url: string; behavior: string; pathParams: string[] }>;
    for (const ep of eps.filter((e) => e.method === 'GET' && e.pathParams.length === 0)) {
      const r = await b.app.inject(ep.url);
      expect(r.statusCode, ep.url).toBe(200);
      expect(j(r).data.length, ep.url).toBeGreaterThan(0);
    }
    for (const ep of eps.filter((e) => e.behavior === 'getById')) {
      const first = j(await b.app.inject(`/mock/fx/api/${ep.url.split('/api/')[1]!.split('/')[0]}`)).data[0].id;
      expect((await b.app.inject(ep.url.replace(/:\w+/, first))).statusCode, ep.url).toBe(200);
    }
    await SwaggerParser.validate(j(await b.app.inject('/api/projects/fx/export?format=openapi')));
  });
});

describe('app running on the Redis adapter (ioredis-mock)', () => {
  it('serves the complete CRUD flow with state held in Redis', async () => {
    const client = new RedisMock();
    await client.flushall();
    const store = new RedisStore(client as unknown as RedisLike);
    const b = await make({ store });
    await createFixtureProject(b, 'students', 'rd');
    const created = j(await b.app.inject({ method: 'POST', url: '/mock/rd/api/students', payload: { name: 'Redis User', email: 'r@example.com', department: 'Civil', year: 2 } }));
    expect(j(await b.app.inject(`/mock/rd/api/students/${created.id}`)).name).toBe('Redis User');
    expect(j(await b.app.inject('/mock/rd/api/students')).pagination.total).toBe(25);
    await b.app.inject({ method: 'PATCH', url: `/mock/rd/api/students/${created.id}`, payload: { year: 4 } });
    expect(j(await b.app.inject(`/mock/rd/api/students/${created.id}`)).year).toBe(4);
    expect((await b.app.inject({ method: 'DELETE', url: `/mock/rd/api/students/${created.id}` })).statusCode).toBe(204);
    expect(j(await b.app.inject('/api/projects/rd/logs')).length).toBe(6);
    // a second app instance over the same Redis sees the same project (shared state)
    const b2 = await make({ store });
    expect((await b2.app.inject('/mock/rd/api/students')).statusCode).toBe(200);
    await b2.app.inject({ method: 'DELETE', url: '/api/projects/rd' });
    expect((await b.app.inject('/mock/rd/api/students')).statusCode).toBe(404);
  });
});
