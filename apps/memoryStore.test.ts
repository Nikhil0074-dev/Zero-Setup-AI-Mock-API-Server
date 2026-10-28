import { expect, it } from 'vitest';
import { MemoryStore } from '../../src/modules/store/memoryStore';
import { storeContract } from './storeContract';

storeContract('memory', async () => new MemoryStore());

it('caps stored logs per project at 500', async () => {
  const s = new MemoryStore();
  for (let i = 0; i < 520; i++) await s.appendLog('p', { timestamp: String(i), projectId: 'p', method: 'GET', path: '/', status: 200, durationMs: 0, endpointId: null });
  expect(await s.getLogs('p', 1000)).toHaveLength(500);
});
