import type { FastifyInstance } from 'fastify';
import { listFixtureNames, loadFixture } from '../fixtures';
import type { ApiGenerator } from '../modules/ai/apiGenerator';
import { buildResourceSchemas } from '../modules/generator/schemaGenerator';
import { generateOpenApi } from '../modules/generator/openApiGenerator';
import type { ProjectService } from '../modules/projects/projectService';
import type { MockStore } from '../modules/store/store.interface';
import { paramNames } from '../modules/validation/routeValidator';
import { createProjectBodySchema, updateProjectBodySchema } from '../schemas/project.schema';
import { HttpError } from '../utils/errors';
import { parseBody, projectView } from './helpers';

interface CreateBody {
  id?: string; name: string; description?: string; definition?: unknown; fixture?: string; prompt?: string; activate?: boolean; ttlMinutes?: number;
}

export async function projectRoutes(app: FastifyInstance, deps: { projects: ProjectService; generator: ApiGenerator; store: MockStore }): Promise<void> {
  const { projects, generator, store } = deps;

  app.post('/api/projects', async (req, reply) => {
    const body = parseBody<CreateBody>(createProjectBodySchema, req.body);
    const sources = [body.definition, body.fixture, body.prompt].filter((x) => x !== undefined).length;
    if (sources !== 1)
      throw new HttpError(400, 'VALIDATION_ERROR', 'Provide exactly one of: definition, fixture, prompt.', [{ field: 'definition', message: 'Exactly one of definition, fixture or prompt is required.' }]);
    let definition: unknown = body.definition;
    if (body.fixture !== undefined) definition = loadFixture(body.fixture);
    if (body.prompt !== undefined) definition = (await generator.generate({ name: body.name, description: body.prompt })).definition;
    const project = await projects.create({ id: body.id, name: body.name, description: body.description, definition, activate: body.activate, ttlMinutes: body.ttlMinutes });
    return reply.code(201).send(projectView(project));
  });

  app.get('/api/projects', async () => (await projects.list()).map(projectView));

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const p = await projects.get(req.params.id);
    return { ...projectView(p), definition: p.definition };
  });

  app.put<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const body = parseBody<{ name?: string; description?: string; definition?: unknown; ttlMinutes?: number }>(updateProjectBodySchema, req.body);
    return projectView(await projects.update(req.params.id, body));
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    await projects.delete(req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/endpoints', async (req) => {
    const p = await projects.get(req.params.id);
    const base = `/mock/${p.id}${p.definition.basePath}`;
    return p.definition.endpoints.map((ep) => ({
      ...ep,
      url: `${base}${ep.path}`,
      pathParams: paramNames(ep.path),
      expectedStatus: ep.responseStatus ?? (ep.behavior === 'create' ? 201 : ep.behavior === 'delete' ? 204 : ep.response?.status ?? 200)
    }));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/schemas', async (req) => {
    const p = await projects.get(req.params.id);
    return Object.fromEntries(Object.entries(p.definition.resources).map(([n, r]) => [n, buildResourceSchemas(r)]));
  });

  app.post<{ Params: { id: string } }>('/api/projects/:id/activate', async (req) => projectView(await projects.setStatus(req.params.id, 'active')));
  app.post<{ Params: { id: string } }>('/api/projects/:id/deactivate', async (req) => projectView(await projects.setStatus(req.params.id, 'inactive')));
  app.post<{ Params: { id: string } }>('/api/projects/:id/reset', async (req) => projectView(await projects.reset(req.params.id)));

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/api/projects/:id/logs', async (req) => {
    await projects.get(req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    return store.getLogs(req.params.id, limit);
  });

  const exportHandler = async (id: string, format: unknown) => {
    const p = await projects.get(id);
    if (format === undefined || format === 'definition') return p.definition;
    if (format === 'openapi') return generateOpenApi(p.id, p.definition);
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid export format.', [{ field: 'format', message: 'Must be "definition" or "openapi".' }]);
  };
  app.post<{ Params: { id: string }; Body: { format?: string } | undefined }>('/api/projects/:id/export', async (req) => exportHandler(req.params.id, req.body?.format));
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>('/api/projects/:id/export', async (req) => exportHandler(req.params.id, req.query.format));

  app.get('/api/meta', async () => ({ fixtures: listFixtureNames() }));
}
