import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Config } from '../config';
import { recordRequest } from '../plugins/requestLogger';
import type { ProjectService } from '../modules/projects/projectService';
import { dispatch } from '../modules/runtime/requestDispatcher';
import type { MockResponse } from '../modules/runtime/responseBuilder';
import type { RouteRegistry } from '../modules/runtime/routeRegistry';
import type { MockStore } from '../modules/store/store.interface';
import { HttpError } from '../utils/errors';

export interface RuntimeDeps {
  projects: ProjectService;
  registry: RouteRegistry;
  store: MockStore;
  config: Pick<Config, 'maxPageSize' | 'maxRecordsPerResource'>;
}

function send(reply: FastifyReply, res: MockResponse) {
  reply.code(res.status);
  if (res.headers) reply.headers(res.headers);
  if (res.body === undefined) return reply.send();
  return reply.type('application/json; charset=utf-8').send(JSON.stringify(res.body));
}

export async function mockRuntimeRoutes(app: FastifyInstance, deps: RuntimeDeps): Promise<void> {
  const { projects, registry, store, config } = deps;

  app.get<{ Params: { projectId: string } }>('/mock/:projectId', async (req) => {
    const p = await projects.getRuntimeProject(req.params.projectId);
    return { id: p.id, name: p.name, basePath: p.definition.basePath, endpoints: p.definition.endpoints.map((e) => ({ method: e.method, path: `${p.definition.basePath}${e.path}` })) };
  });

  app.route<{ Params: { projectId: string; '*': string } }>({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/mock/:projectId/*',
    handler: async (req, reply) => {
      const project = await projects.getRuntimeProject(req.params.projectId);
      const trace: { endpointId?: string } = {};
      const started = performance.now();
      let status = 500;
      try {
        const result = await dispatch({
          project,
          api: registry.get(project),
          store,
          limits: config,
          method: req.method,
          path: `/${req.params['*']}`,
          query: req.query as Record<string, unknown>,
          body: req.body,
          trace
        });
        status = result.status;
        return send(reply, result);
      } catch (err) {
        status = err instanceof HttpError ? err.status : 500;
        throw err;
      } finally {
        await recordRequest(store, {
          projectId: project.id,
          method: req.method,
          path: `/${req.params['*']}`,
          status,
          durationMs: Math.round((performance.now() - started) * 100) / 100,
          endpointId: trace.endpointId ?? null
        });
      }
    }
  });
}
