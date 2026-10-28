import type { FastifyInstance } from 'fastify';
import { HttpError } from '../utils/errors';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 404: 'NOT_FOUND', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 429: 'RATE_LIMITED'
};

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: Error, req, reply) => {
    if (err instanceof HttpError) {
      if (err.headers) reply.headers(err.headers);
      return reply.code(err.status).send({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send({ error: CODE_BY_STATUS[status] ?? 'BAD_REQUEST', message: status === 413 ? 'The request body is too large.' : err.message });
    }
    // Never leak internals: log server-side, return a generic message.
    req.log.error({ err }, 'Unhandled error');
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
  });

  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.url.split('?')[0]} not found.` }));
}
