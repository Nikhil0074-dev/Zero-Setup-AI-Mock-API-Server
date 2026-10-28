import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectService } from '../../src/modules/projects/projectService';
import { RouteRegistry } from '../../src/modules/runtime/routeRegistry';
import { MemoryStore } from '../../src/modules/store/memoryStore';
import { HttpError } from '../../src/utils/errors';
import { fixtureDef, miniDef } from '../helpers';

const cfg = { maxProjects: 3, maxEndpoints: 50, maxResources: 20, maxSeedCount: 200, defaultTtlMinutes: 0 };

describe('ProjectService', () => {
  let store: MemoryStore;
  let svc: ProjectService;
  let now: number;
  beforeEach(() => {
    store = new MemoryStore();
    now = Date.parse('2026-06-01T00:00:00Z');
    svc = new ProjectService(store, new RouteRegistry(), cfg, () => new Date(now));
  });

  it('creates a project, generates an id and seeds data', async () => {
    const p = await svc.create({ name: 'My Things', definition: miniDef() });
    expect(p.id).toMatch(/^my-things-[0-9a-f]{4}$/);
    expect(p.status).toBe('active');
    expect(await store.countRecords(p.id, 'things')).toBe(3);
  });
  it('rejects invalid definitions with 422 and stores nothing', async () => {
    await expect(svc.create({ name: 'x', definition: { nope: 1 } })).rejects.toMatchObject({ status: 422, code: 'INVALID_DEFINITION' });
    expect(await store.listProjects()).toHaveLength(0);
  });
  it('rejects duplicate and malformed ids', async () => {
    await svc.create({ id: 'abc', name: 'a', definition: miniDef() });
    await expect(svc.create({ id: 'abc', name: 'a', definition: miniDef() })).rejects.toMatchObject({ status: 409 });
    await expect(svc.create({ id: '../x', name: 'a', definition: miniDef() })).rejects.toMatchObject({ status: 400 });
  });
  it('enforces the project limit', async () => {
    for (let i = 0; i < 3; i++) await svc.create({ name: `p${i}`, definition: miniDef() });
    await expect(svc.create({ name: 'p4', definition: miniDef() })).rejects.toMatchObject({ status: 409, code: 'LIMIT_EXCEEDED' });
  });
  it('can create inactive projects and activate them', async () => {
    const p = await svc.create({ name: 'a', definition: miniDef(), activate: false });
    await expect(svc.getRuntimeProject(p.id)).rejects.toMatchObject({ status: 503, code: 'ENVIRONMENT_INACTIVE' });
    await svc.setStatus(p.id, 'active');
    await expect(svc.getRuntimeProject(p.id)).resolves.toBeTruthy();
  });
  it('404s for unknown projects', async () => {
    await expect(svc.get('nope')).rejects.toBeInstanceOf(HttpError);
    await expect(svc.getRuntimeProject('nope')).rejects.toMatchObject({ status: 404 });
  });
  it('expires environments using the injected clock', async () => {
    const p = await svc.create({ name: 'a', definition: miniDef(), ttlMinutes: 10 });
    expect(p.expiresAt).toBe('2026-06-01T00:10:00.000Z');
    await expect(svc.getRuntimeProject(p.id)).resolves.toBeTruthy();
    now += 10 * 60_000;
    await expect(svc.getRuntimeProject(p.id)).rejects.toMatchObject({ status: 410, code: 'ENVIRONMENT_EXPIRED' });
  });
  it('sweeps expired environments and their data', async () => {
    const a = await svc.create({ name: 'a', definition: miniDef(), ttlMinutes: 5 });
    const b = await svc.create({ name: 'b', definition: miniDef() });
    now += 6 * 60_000;
    expect(await svc.sweepExpired()).toEqual([a.id]);
    expect(await store.getProject(a.id)).toBeNull();
    expect(await store.countRecords(a.id, 'things')).toBe(0);
    expect(await store.getProject(b.id)).not.toBeNull();
  });
  it('applies the default TTL from config', async () => {
    const s2 = new ProjectService(store, new RouteRegistry(), { ...cfg, defaultTtlMinutes: 60 }, () => new Date(now));
    expect((await s2.create({ name: 'a', definition: miniDef() })).expiresAt).toBe('2026-06-01T01:00:00.000Z');
    expect((await s2.create({ name: 'b', definition: miniDef(), ttlMinutes: 0 })).expiresAt).toBeNull();
  });
  it('resets simulated data to the seed state', async () => {
    const p = await svc.create({ name: 'a', definition: miniDef() });
    await store.insertRecord(p.id, 'things', { id: 'extra', name: 'x' });
    await store.removeRecord(p.id, 'things', 'thg_101');
    await svc.reset(p.id);
    const ids = (await store.listRecords(p.id, 'things')).map((r) => r.id);
    expect(ids.sort()).toEqual(['thg_101', 'thg_102', 'thg_103']);
  });
  it('updating the definition validates, reseeds changed resources only and drops removed ones', async () => {
    const def = fixtureDef('library');
    const p = await svc.create({ name: 'lib', definition: def });
    await store.insertRecord(p.id, 'borrowers', { id: 'keep', name: 'x' });
    const next = structuredClone(def);
    next.resources.books!.seedCount = 5;
    await svc.update(p.id, { definition: next });
    expect(await store.countRecords(p.id, 'books')).toBe(5);
    expect(await store.getRecord(p.id, 'borrowers', 'keep')).not.toBeNull();
    await expect(svc.update(p.id, { definition: { bad: true } })).rejects.toMatchObject({ status: 422 });
    expect(await store.countRecords(p.id, 'books')).toBe(5);
    delete next.resources.borrowers;
    next.endpoints = next.endpoints.filter((e) => e.resource !== 'borrowers');
    await svc.update(p.id, { definition: next });
    expect(await store.countRecords(p.id, 'borrowers')).toBe(0);
  });
  it('renames and changes TTL', async () => {
    const p = await svc.create({ name: 'a', definition: miniDef() });
    const u = await svc.update(p.id, { name: 'b', ttlMinutes: 30 });
    expect(u.name).toBe('b');
    expect(u.expiresAt).toBe('2026-06-01T00:30:00.000Z');
  });
  it('deletes projects and their data', async () => {
    const p = await svc.create({ name: 'a', definition: miniDef() });
    await svc.delete(p.id);
    expect(await store.getProject(p.id)).toBeNull();
    expect(await store.countRecords(p.id, 'things')).toBe(0);
    await expect(svc.delete(p.id)).rejects.toMatchObject({ status: 404 });
  });
});
