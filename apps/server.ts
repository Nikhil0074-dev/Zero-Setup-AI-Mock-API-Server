import { buildApp } from './app';

export async function startServer(): Promise<void> {
  const { app, projects, config } = await buildApp({ logger: true });
  const sweep = setInterval(() => void projects.sweepExpired().catch((e) => app.log.error(e)), 60_000);
  sweep.unref();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    clearInterval(sweep);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Dashboard: http://${config.host}:${config.port}/  (AI provider: ${config.aiProvider})`);
}
