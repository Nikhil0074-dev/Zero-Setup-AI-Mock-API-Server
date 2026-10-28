import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type Config } from './config';
import { ApiGenerator } from './modules/ai/apiGenerator';
import { createAiProvider, type AiProvider } from './modules/ai/aiClient';
import { ProjectService } from './modules/projects/projectService';
import { RouteRegistry } from './modules/runtime/routeRegistry';
import { createStore } from './modules/store/storeFactory';
import type { MockStore } from './modules/store/store.interface';
import { registerAdminAuth } from './plugins/adminAuth';
import { registerCors } from './plugins/cors';
import { registerErrorHandling } from './plugins/errorHandler';
import { registerRateLimits } from './plugins/rateLimit';
import { generationRoutes } from './routes/generation.routes';
import { healthRoutes } from './routes/health.routes';
import { mockRuntimeRoutes } from './routes/mockRuntime.routes';
import { projectRoutes } from './routes/projects.routes';
import type { Clock } from './utils/dates';
import { HttpError } from './utils/errors';

export interface AppOptions {
  config?: Partial<Config>;
  store?: MockStore;
  aiProvider?: AiProvider;
  clock?: Clock;
  logger?: boolean;
}

export interface BuiltApp {
  app: FastifyInstance;
  projects: ProjectService;
  store: MockStore;
  config: Config;
}

export async function buildApp(opts: AppOptions = {}): Promise<BuiltApp> {
  const config: Config = { ...loadConfig(), ...opts.config };
  const store = opts.store ?? (await createStore(config));
  const registry = new RouteRegistry();
  const projects = new ProjectService(store, registry, config, opts.clock);
  const provider = opts.aiProvider ?? createAiProvider(config);
  const generator = new ApiGenerator(provider, config);

  const app = Fastify({ logger: opts.logger ? { level: config.logLevel } : false, bodyLimit: config.maxBodyBytes });

  // JSON parser that tolerates empty bodies and reports malformed JSON as a structured 400.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON.'), undefined);
    }
  });

  registerErrorHandling(app);
  await registerCors(app);
  registerRateLimits(app, { generate: config.generateRatePerMinute, mock: config.mockRatePerMinute });
  registerAdminAuth(app, config.adminToken);

  await app.register(healthRoutes, { aiProvider: provider.name, storeType: config.storeType });
  await app.register(generationRoutes, { generator });
  await app.register(projectRoutes, { projects, generator, store });
  await app.register(mockRuntimeRoutes, { projects, registry, store, config });
  await app.register(fastifyStatic, { root: path.resolve(__dirname, '../../web/public'), wildcard: false });

  app.addHook('onClose', async () => store.close());
  return { app, projects, store, config };
}
