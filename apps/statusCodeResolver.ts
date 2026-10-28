import type { Behavior, EndpointDef } from '../../types';

const DEFAULTS: Record<Behavior, number> = { list: 200, getById: 200, create: 201, update: 200, delete: 204, static: 200 };

export const defaultStatus = (b: Behavior): number => DEFAULTS[b];

export function resolveSuccessStatus(ep: EndpointDef): number {
  if (ep.behavior === 'static') return ep.response?.status ?? ep.responseStatus ?? 200;
  return ep.responseStatus ?? defaultStatus(ep.behavior);
}

export const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large',
  415: 'Unsupported Media Type', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable'
};
