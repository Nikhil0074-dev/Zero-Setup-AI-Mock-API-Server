import { describe, expect, it } from 'vitest';
import { compileRoute, matchRoute, splitPath } from '../../src/modules/runtime/routeMatcher';
import { HttpError } from '../../src/utils/errors';

describe('routeMatcher', () => {
  it('matches a static route', () => expect(matchRoute(compileRoute('/api/students'), splitPath('/api/students'))).toEqual({}));
  it('extracts parameters', () => expect({ ...matchRoute(compileRoute('/api/students/:id'), splitPath('/api/students/stu_102'))! }).toEqual({ id: 'stu_102' }));
  it('extracts several parameters in order', () =>
    expect(Object.keys(matchRoute(compileRoute('/u/:userId/o/:orderId'), splitPath('/u/1/o/2'))!)).toEqual(['userId', 'orderId']));
  it('does not match different literals', () => expect(matchRoute(compileRoute('/api/students'), splitPath('/api/teachers'))).toBeNull());
  it('does not match different segment counts', () => {
    expect(matchRoute(compileRoute('/api/students/:id'), splitPath('/api/students'))).toBeNull();
    expect(matchRoute(compileRoute('/api/students'), splitPath('/api/students/1'))).toBeNull();
  });
  it('tolerates a trailing slash and query string', () => expect(splitPath('/api/students/?page=2')).toEqual(['api', 'students']));
  it('decodes percent-encoded parameters', () => expect({ ...matchRoute(compileRoute('/x/:id'), ['x', 'a%20b'])! }).toEqual({ id: 'a b' }));
  it('rejects malformed percent-encoding with a 400', () => expect(() => matchRoute(compileRoute('/x/:id'), ['x', '%E0%A4%A'])).toThrow(HttpError));
  it('counts static segments for specificity', () => {
    expect(compileRoute('/users/me').staticCount).toBeGreaterThan(compileRoute('/users/:id').staticCount);
  });
  it('is not fooled by prototype-ish parameter values', () => expect({ ...matchRoute(compileRoute('/x/:id'), ['x', '__proto__'])! }).toEqual({ id: '__proto__' }));
});
