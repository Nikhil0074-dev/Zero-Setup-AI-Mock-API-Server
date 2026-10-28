import type { FastifyInstance } from 'fastify';
import { listFixtureNames, loadFixture } from '../fixtures';
import type { ApiGenerator } from '../modules/ai/apiGenerator';
import { buildResourceSchemas } from '../modules/generator/schemaGenerator';
import { generateBodySchema } from '../schemas/project.schema';
import type { ApiDefinition } from '../types';
import { parseBody } from './helpers';

export async function generationRoutes(app: FastifyInstance, deps: { generator: ApiGenerator }): Promise<void> {
  app.post('/api/generate', async (req) => {
    const body = parseBody<{ name?: string; description: string }>(generateBodySchema, req.body);
    const result = await deps.generator.generate(body);
    const schemas = Object.fromEntries(Object.entries(result.definition.resources).map(([n, r]) => [n, buildResourceSchemas(r)]));
    return { ...result, schemas };
  });

  app.get('/api/fixtures', async () =>
    listFixtureNames().map((name) => {
      const d = loadFixture(name) as ApiDefinition;
      return { name, title: d.name, description: d.description ?? '', resourceCount: Object.keys(d.resources).length, endpointCount: d.endpoints.length };
    })
  );

  app.get<{ Params: { name: string } }>('/api/fixtures/:name', async (req) => loadFixture(req.params.name));
}
