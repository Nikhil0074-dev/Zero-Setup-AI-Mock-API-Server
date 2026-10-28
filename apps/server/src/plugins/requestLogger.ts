import type { MockStore } from '../modules/store/store.interface';

/** Records non-sensitive metadata only: no headers, query strings or bodies. */
export async function recordRequest(
  store: MockStore,
  entry: { projectId: string; method: string; path: string; status: number; durationMs: number; endpointId: string | null }
): Promise<void> {
  try {
    await store.appendLog(entry.projectId, { ...entry, path: entry.path.split('?')[0]!, timestamp: new Date().toISOString() });
  } catch {
    /* logging must never break a request */
  }
}
