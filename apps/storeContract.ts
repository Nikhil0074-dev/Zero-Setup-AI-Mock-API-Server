import { describe, expect, it, beforeEach } from 'vitest';
import type { MockStore } from '../../src/modules/store/store.interface';
import type { Project } from '../../src/types';
import { miniDef } from '../helpers';

const project = (id: string): Project => ({ id, name: id, description: '', status: 'active', definition: miniDef(), createdAt: 't', updatedAt: 't', expiresAt: null });
const rec = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `n-${id}`, ...extra });

/** Behaviour every storage adapter must satisfy. */
export function storeContract(name: string, make: () => Promise<MockStore>) {
  describe(`${name} store contract`, () => {
    let s: MockStore;
    beforeEach(async () => {
      s = await make();
    });

    it('saves and retrieves a project', async () => {
      await s.saveProject(project('p1'));
      expect((await s.getProject('p1'))?.name).toBe('p1');
    });
    it('returns null for unknown projects', async () => expect(await s.getProject('nope')).toBeNull());
    it('lists projects', async () => {
      await s.saveProject(project('p1'));
      await s.saveProject(project('p2'));
      expect((await s.listProjects()).map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    });
    it('overwrites a project on save', async () => {
      await s.saveProject(project('p1'));
      await s.saveProject({ ...project('p1'), name: 'renamed' });
      expect((await s.getProject('p1'))?.name).toBe('renamed');
      expect(await s.listProjects()).toHaveLength(1);
    });
    it('sets, lists, counts and gets records', async () => {
      await s.setRecords('p1', 'things', [rec('a'), rec('b')]);
      expect(await s.countRecords('p1', 'things')).toBe(2);
      expect((await s.listRecords('p1', 'things')).map((r) => r.id).sort()).toEqual(['a', 'b']);
      expect((await s.getRecord('p1', 'things', 'a'))?.name).toBe('n-a');
      expect(await s.getRecord('p1', 'things', 'zzz')).toBeNull();
    });
    it('setRecords replaces the previous set', async () => {
      await s.setRecords('p1', 'things', [rec('a'), rec('b')]);
      await s.setRecords('p1', 'things', [rec('c')]);
      expect((await s.listRecords('p1', 'things')).map((r) => r.id)).toEqual(['c']);
    });
    it('inserts a record', async () => {
      await s.insertRecord('p1', 'things', rec('x'));
      expect(await s.countRecords('p1', 'things')).toBe(1);
    });
    it('merges updates and keeps the id', async () => {
      await s.setRecords('p1', 'things', [rec('a', { qty: 1 })]);
      const u = await s.updateRecord('p1', 'things', 'a', { qty: 5, id: 'hijack' });
      expect(u).toMatchObject({ id: 'a', qty: 5, name: 'n-a' });
      expect(await s.getRecord('p1', 'things', 'a')).toMatchObject({ qty: 5 });
    });
    it('update of a missing record returns null', async () => expect(await s.updateRecord('p1', 'things', 'nope', { a: 1 })).toBeNull());
    it('removes records', async () => {
      await s.setRecords('p1', 'things', [rec('a')]);
      expect(await s.removeRecord('p1', 'things', 'a')).toBe(true);
      expect(await s.removeRecord('p1', 'things', 'a')).toBe(false);
      expect(await s.getRecord('p1', 'things', 'a')).toBeNull();
    });
    it('isolates records between projects and resources', async () => {
      await s.setRecords('p1', 'things', [rec('a')]);
      await s.setRecords('p2', 'things', [rec('b')]);
      await s.setRecords('p1', 'other', [rec('c')]);
      expect((await s.listRecords('p1', 'things')).map((r) => r.id)).toEqual(['a']);
      expect((await s.listRecords('p2', 'things')).map((r) => r.id)).toEqual(['b']);
    });
    it('clears one resource or all of them', async () => {
      await s.setRecords('p1', 'things', [rec('a')]);
      await s.setRecords('p1', 'other', [rec('c')]);
      await s.clearRecords('p1', 'things');
      expect(await s.countRecords('p1', 'things')).toBe(0);
      expect(await s.countRecords('p1', 'other')).toBe(1);
      await s.clearRecords('p1');
      expect(await s.countRecords('p1', 'other')).toBe(0);
    });
    it('deleting a project removes its records and logs but not others', async () => {
      await s.saveProject(project('p1'));
      await s.saveProject(project('p2'));
      await s.setRecords('p1', 'things', [rec('a')]);
      await s.setRecords('p2', 'things', [rec('b')]);
      await s.appendLog('p1', { timestamp: 't', projectId: 'p1', method: 'GET', path: '/x', status: 200, durationMs: 1, endpointId: null });
      await s.deleteProject('p1');
      expect(await s.getProject('p1')).toBeNull();
      expect(await s.countRecords('p1', 'things')).toBe(0);
      expect(await s.getLogs('p1', 10)).toEqual([]);
      expect(await s.countRecords('p2', 'things')).toBe(1);
    });
    it('returns logs newest first and honours the limit', async () => {
      for (let i = 0; i < 5; i++) await s.appendLog('p1', { timestamp: String(i), projectId: 'p1', method: 'GET', path: `/${i}`, status: 200, durationMs: i, endpointId: null });
      const logs = await s.getLogs('p1', 3);
      expect(logs.map((l) => l.path)).toEqual(['/4', '/3', '/2']);
    });
    it('does not leak internal references (mutating a result does not change the store)', async () => {
      await s.setRecords('p1', 'things', [rec('a', { qty: 1 })]);
      const r = await s.getRecord('p1', 'things', 'a');
      r!.qty = 99;
      expect((await s.getRecord('p1', 'things', 'a'))?.qty).toBe(1);
    });
  });
}
