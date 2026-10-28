import { buildApp, type AppOptions, type BuiltApp } from '../src/app';
import { loadFixture } from '../src/fixtures';
import type { ApiDefinition } from '../src/types';

export async function makeApp(opts: AppOptions = {}): Promise<BuiltApp> {
  return buildApp({ ...opts, config: { storeType: 'memory', adminToken: undefined, ...opts.config } });
}

export async function createFixtureProject(built: BuiltApp, fixture: string, id = `${fixture}-demo`, extra: Record<string, unknown> = {}) {
  const res = await built.app.inject({ method: 'POST', url: '/api/projects', payload: { id, name: id, fixture, ...extra } });
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
  return res.json() as { id: string; baseUrl: string };
}

export const fixtureDef = (name: string) => loadFixture(name) as ApiDefinition;

export const LIMITS = { maxEndpoints: 50, maxResources: 20, maxSeedCount: 200 };

export const miniDef = (over: Partial<ApiDefinition> = {}): ApiDefinition => ({
  name: 'Mini',
  version: '1.0.0',
  apiType: 'REST',
  basePath: '/api',
  resources: { things: { idPrefix: 'thg', seedCount: 3, fields: { name: { type: 'string', required: true }, qty: { type: 'integer', min: 0, max: 10 } } } },
  endpoints: [
    { id: 'list-things', method: 'GET', path: '/things', behavior: 'list', resource: 'things' },
    { id: 'get-thing', method: 'GET', path: '/things/:id', behavior: 'getById', resource: 'things' }
  ],
  ...over
});
