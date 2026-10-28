import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/plugins/rateLimit';

describe('RateLimiter', () => {
  it('allows up to the limit then blocks with a retry hint', () => {
    let now = 0;
    const l = new RateLimiter(3, 60_000, () => now);
    expect([l.check('a'), l.check('a'), l.check('a')]).toEqual([null, null, null]);
    expect(l.check('a')).toBe(60);
    now = 30_000;
    expect(l.check('a')).toBe(30);
  });
  it('tracks keys independently and resets after the window', () => {
    let now = 0;
    const l = new RateLimiter(1, 1000, () => now);
    expect(l.check('a')).toBeNull();
    expect(l.check('b')).toBeNull();
    expect(l.check('a')).not.toBeNull();
    now = 1001;
    expect(l.check('a')).toBeNull();
  });
});
