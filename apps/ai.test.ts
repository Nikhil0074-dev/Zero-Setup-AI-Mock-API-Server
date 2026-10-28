import { describe, expect, it, vi } from 'vitest';
import { ApiGenerator } from '../../src/modules/ai/apiGenerator';
import { AiProviderError, AnthropicProvider, createAiProvider, type AiProvider } from '../../src/modules/ai/aiClient';
import { RuleBasedProvider } from '../../src/modules/ai/ruleBasedProvider';
import { validateDefinition } from '../../src/modules/validation/definitionValidator';
import { HttpError } from '../../src/utils/errors';
import { LIMITS, miniDef } from '../helpers';

const scripted = (...replies: Array<string | Error>): AiProvider & { calls: string[] } => {
  const calls: string[] = [];
  let i = 0;
  return {
    name: 'scripted',
    calls,
    async generate({ user }) {
      calls.push(user);
      const r = replies[Math.min(i++, replies.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    }
  };
};

describe('RuleBasedProvider (offline fallback)', () => {
  const gen = new ApiGenerator(new RuleBasedProvider(), LIMITS);
  it('always produces a definition that passes validation', async () => {
    for (const d of ['students api', 'e-commerce with products, users and orders, login and order history', 'library: books and authors', 'something totally unknown', 'a read-only products catalogue'])
      expect(validateDefinition((await gen.generate({ description: d })).definition, LIMITS).issues, d).toEqual([]);
  });
  it('recognises resources and orders them by appearance', async () => {
    const { definition } = await gen.generate({ description: 'I need orders, products and users' });
    expect(Object.keys(definition.resources)).toEqual(['orders', 'products', 'users']);
  });
  it('adds nested order history and login when requested', async () => {
    const { definition } = await gen.generate({ description: 'e-commerce with products, users and orders; login simulation and order history' });
    const ids = definition.endpoints.map((e) => e.id);
    expect(ids).toContain('list-user-orders');
    expect(ids).toContain('login');
  });
  it('honours read-only', async () => {
    const { definition } = await gen.generate({ description: 'read-only products catalogue' });
    expect(definition.endpoints.every((e) => e.method === 'GET')).toBe(true);
  });
  it('falls back to a generic resource', async () => {
    const { definition } = await gen.generate({ description: 'quantum flux capacitor inventory' });
    expect(Object.keys(definition.resources)).toEqual(['items']);
  });
  it('uses the provided API name', async () => expect((await gen.generate({ name: 'My API', description: 'students' })).definition.name).toBe('My API'));
});

describe('ApiGenerator with a mocked provider', () => {
  const good = JSON.stringify(miniDef());
  it('accepts valid JSON on the first attempt', async () => {
    const r = await new ApiGenerator(scripted(good), LIMITS).generate({ description: 'things' });
    expect(r).toMatchObject({ attempts: 1, provider: 'scripted' });
  });
  it('tolerates code fences and fills omitted top-level defaults', async () => {
    const { name, version, apiType, basePath, ...rest } = miniDef();
    void name; void version; void apiType; void basePath;
    const r = await new ApiGenerator(scripted('```json\n' + JSON.stringify(rest) + '\n```'), LIMITS).generate({ name: 'X', description: 'things' });
    expect(r.definition).toMatchObject({ name: 'X', version: '1.0.0', apiType: 'REST', basePath: '/api' });
  });
  it('retries once with validator feedback when output is invalid', async () => {
    const bad = JSON.stringify({ ...miniDef(), endpoints: [{ id: 'x', method: 'GET', path: '/x', behavior: 'eval' }] });
    const p = scripted(bad, good);
    const r = await new ApiGenerator(p, LIMITS).generate({ description: 'things' });
    expect(r.attempts).toBe(2);
    expect(p.calls[1]).toContain('rejected by the validator');
  });
  it('retries when the output is not JSON', async () => expect((await new ApiGenerator(scripted('I cannot do that', good), LIMITS).generate({ description: 'x' })).attempts).toBe(2));
  it('fails with 422 and details when output stays invalid', async () => {
    const err = (await new ApiGenerator(scripted('{"nope":true}'), LIMITS).generate({ description: 'x' }).catch((e: unknown) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 422, code: 'AI_OUTPUT_INVALID' });
    expect(err.details!.length).toBeGreaterThan(0);
  });
  it('rejects AI output that tries to smuggle code', async () => {
    const evil = JSON.stringify({ ...miniDef(), endpoints: [{ id: 'x', method: 'GET', path: '/x', behavior: 'list', resource: 'things', handler: 'require("child_process").exec("id")' }] });
    await expect(new ApiGenerator(scripted(evil), LIMITS).generate({ description: 'x' })).rejects.toMatchObject({ status: 422 });
  });
  it('maps provider timeouts to 504 and other failures to 502', async () => {
    await expect(new ApiGenerator(scripted(new AiProviderError('slow', 'timeout')), LIMITS).generate({ description: 'x' })).rejects.toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
    await expect(new ApiGenerator(scripted(new AiProviderError('boom', 'http')), LIMITS).generate({ description: 'x' })).rejects.toMatchObject({ status: 502 });
    await expect(new ApiGenerator(scripted(new Error('weird')), LIMITS).generate({ description: 'x' })).rejects.toMatchObject({ status: 502 });
  });
});

describe('AnthropicProvider', () => {
  const opts = { apiKey: 'sk-test', model: 'm', timeoutMs: 50 };
  const okFetch = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('sends the key as a header (never in the body) and joins text blocks', async () => {
    const f = okFetch({ content: [{ type: 'text', text: '{"a"' }, { type: 'text', text: ':1}' }] });
    const out = await new AnthropicProvider({ ...opts, fetchImpl: f }).generate({ system: 's', user: 'u' });
    expect(out).toBe('{"a":1}');
    const [url, init] = (f as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
    expect(String(init.body)).not.toContain('sk-test');
  });
  it('throws on HTTP errors', async () => await expect(new AnthropicProvider({ ...opts, fetchImpl: okFetch({}, 429) }).generate({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'http' }));
  it('throws on empty content', async () => await expect(new AnthropicProvider({ ...opts, fetchImpl: okFetch({ content: [] }) }).generate({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'empty' }));
  it('times out', async () => {
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    await expect(new AnthropicProvider({ ...opts, fetchImpl: slow }).generate({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('reports network failures without leaking details', async () => {
    const down = (async () => { throw new Error('ECONNREFUSED 10.0.0.1'); }) as unknown as typeof fetch;
    const err = (await new AnthropicProvider({ ...opts, fetchImpl: down }).generate({ system: 's', user: 'u' }).catch((e: unknown) => e)) as Error;
    expect(err).toMatchObject({ kind: 'network' });
    expect(err.message).not.toContain('10.0.0.1');
  });
});

describe('createAiProvider', () => {
  const base = { aiProvider: 'auto' as const, anthropicApiKey: undefined, anthropicModel: 'm', aiTimeoutMs: 1000 };
  it('uses rule-based without a key', () => expect(createAiProvider(base).name).toBe('rule-based'));
  it('uses anthropic when a key is present', () => expect(createAiProvider({ ...base, anthropicApiKey: 'k' }).name).toBe('anthropic'));
  it('can be forced to rule-based', () => expect(createAiProvider({ ...base, aiProvider: 'rule-based', anthropicApiKey: 'k' }).name).toBe('rule-based'));
  it('requires a key when anthropic is forced', () => expect(() => createAiProvider({ ...base, aiProvider: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/));
});
