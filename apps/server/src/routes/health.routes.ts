import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance, opts: { aiProvider: string; storeType: string }): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), aiProvider: opts.aiProvider, store: opts.storeType }));
}
