import { startServer } from './server';

startServer().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
