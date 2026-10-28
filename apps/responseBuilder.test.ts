import { describe, expect, it } from 'vitest';
import { buildResponse } from '../../src/modules/runtime/responseBuilder';
import { defaultStatus, resolveSuccessStatus } from '../../src/modules/runtime/statusCodeResolver';

describe('responseBuilder', () => {
  it('keeps the body for 200/201', () => {
    expect(buildResponse(200, { a: 1 }).body).toEqual({ a: 1 });
    expect(buildResponse(201, { a: 1 }).status).toBe(201);
  });
  it('drops the body for 204 and 304', () => {
    expect(buildResponse(204, { a: 1 })).not.toHaveProperty('body');
    expect(buildResponse(304, 'x')).not.toHaveProperty('body');
  });
  it('passes headers through', () => expect(buildResponse(200, {}, { 'x-a': '1' }).headers).toEqual({ 'x-a': '1' }));
});

describe('statusCodeResolver', () => {
  it('has sensible defaults', () => {
    expect(defaultStatus('list')).toBe(200);
    expect(defaultStatus('create')).toBe(201);
    expect(defaultStatus('delete')).toBe(204);
  });
  it('honours responseStatus and static response status', () => {
    expect(resolveSuccessStatus({ id: 'a', method: 'POST', path: '/a', behavior: 'create', responseStatus: 202 })).toBe(202);
    expect(resolveSuccessStatus({ id: 'a', method: 'GET', path: '/a', behavior: 'static', response: { status: 418 } })).toBe(418);
    expect(resolveSuccessStatus({ id: 'a', method: 'GET', path: '/a', behavior: 'static', response: {} })).toBe(200);
  });
});
