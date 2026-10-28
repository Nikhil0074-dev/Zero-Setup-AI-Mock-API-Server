import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../utils/errors';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** When ADMIN_TOKEN is set, every /api/* management route requires `Authorization: Bearer <token>`. Mock routes stay open. */
export function registerAdminAuth(app: FastifyInstance, token: string | undefined): void {
  if (!token) return;
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!safeEqual(given, token)) throw new HttpError(401, 'UNAUTHORIZED', 'A valid management token is required.', undefined, { 'www-authenticate': 'Bearer' });
  });
}
