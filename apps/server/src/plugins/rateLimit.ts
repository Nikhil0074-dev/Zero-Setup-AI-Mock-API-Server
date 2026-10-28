import type { FastifyInstance } from 'fastify';
import { HttpError } from '../utils/errors';

/** Fixed-window in-memory limiter. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now
  ) {}

  /** Returns null when allowed, otherwise the number of seconds to wait. */
  check(key: string): number | null {
    const t = this.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return null;
    }
    entry.count++;
    return entry.count > this.limit ? Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) : null;
  }
}

export function registerRateLimits(app: FastifyInstance, limits: { generate: number; mock: number }): void {
  const generate = new RateLimiter(limits.generate);
  const mock = new RateLimiter(limits.mock);
  app.addHook('onRequest', async (req) => {
    const path = req.url.split('?')[0]!;
    const limiter = path === '/api/generate' ? generate : path.startsWith('/mock/') ? mock : null;
    if (!limiter) return;
    const wait = limiter.check(req.ip);
    if (wait !== null) throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', undefined, { 'retry-after': String(wait) });
  });
}
