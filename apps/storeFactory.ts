import type { Config } from '../../config';
import { MemoryStore } from './memoryStore';
import { RedisStore, type RedisLike } from './redisStore';
import type { MockStore } from './store.interface';

/** Select the configured adapter. `ioredis` is loaded lazily so it is only required when STORE=redis. */
export async function createStore(config: Pick<Config, 'storeType' | 'redisUrl'>): Promise<MockStore> {
  if (config.storeType === 'memory') return new MemoryStore();
  let Redis: new (url: string, opts?: Record<string, unknown>) => RedisLike;
  try {
    const modName = 'ioredis';
    Redis = ((await import(modName)) as { default: typeof Redis }).default;
  } catch {
    throw new Error('STORE=redis requires the optional "ioredis" package. Run: npm install ioredis --workspace apps/server');
  }
  return new RedisStore(new Redis(config.redisUrl, { maxRetriesPerRequest: 2 }));
}
