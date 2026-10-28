import RedisMock from 'ioredis-mock';
import { expect, it } from 'vitest';
import { RedisStore, type RedisLike } from '../../src/modules/store/redisStore';
import { createStore } from '../../src/modules/store/storeFactory';
import { MemoryStore } from '../../src/modules/store/memoryStore';
import { storeContract } from './storeContract';

// The adapter is exercised against ioredis-mock (an in-process Redis emulation), not a real Redis server.
storeContract('redis (ioredis-mock)', async () => {
  const client = new RedisMock();
  await client.flushall();
  return new RedisStore(client as unknown as RedisLike);
});

it('storeFactory returns the in-memory adapter by default', async () => {
  expect(await createStore({ storeType: 'memory', redisUrl: '' })).toBeInstanceOf(MemoryStore);
});
