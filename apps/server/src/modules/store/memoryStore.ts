import type { LogEntry, MockRecord, Project } from '../../types';
import type { MockStore } from './store.interface';

const MAX_LOGS_PER_PROJECT = 500;
const clone = <T>(v: T): T => structuredClone(v);

/** Default zero-setup storage. State is lost on restart and is not shared between processes. */
export class MemoryStore implements MockStore {
  private projects = new Map<string, Project>();
  private records = new Map<string, Map<string, Map<string, MockRecord>>>();
  private logs = new Map<string, LogEntry[]>();

  private table(projectId: string, resource: string): Map<string, MockRecord> {
    let p = this.records.get(projectId);
    if (!p) this.records.set(projectId, (p = new Map()));
    let t = p.get(resource);
    if (!t) p.set(resource, (t = new Map()));
    return t;
  }

  async saveProject(project: Project) {
    this.projects.set(project.id, clone(project));
  }
  async getProject(id: string) {
    const p = this.projects.get(id);
    return p ? clone(p) : null;
  }
  async listProjects() {
    return [...this.projects.values()].map(clone);
  }
  async deleteProject(id: string) {
    this.projects.delete(id);
    this.records.delete(id);
    this.logs.delete(id);
  }

  async setRecords(projectId: string, resource: string, records: MockRecord[]) {
    const t = new Map<string, MockRecord>();
    for (const r of records) t.set(r.id, clone(r));
    let p = this.records.get(projectId);
    if (!p) this.records.set(projectId, (p = new Map()));
    p.set(resource, t);
  }
  async listRecords(projectId: string, resource: string) {
    return [...this.table(projectId, resource).values()].map(clone);
  }
  async countRecords(projectId: string, resource: string) {
    return this.table(projectId, resource).size;
  }
  async getRecord(projectId: string, resource: string, id: string) {
    const r = this.table(projectId, resource).get(id);
    return r ? clone(r) : null;
  }
  async insertRecord(projectId: string, resource: string, record: MockRecord) {
    this.table(projectId, resource).set(record.id, clone(record));
  }
  async updateRecord(projectId: string, resource: string, id: string, patch: Record<string, unknown>) {
    const t = this.table(projectId, resource);
    const existing = t.get(id);
    if (!existing) return null;
    const next = { ...existing, ...clone(patch), id } as MockRecord; // synchronous read-modify-write: atomic in one process
    t.set(id, next);
    return clone(next);
  }
  async removeRecord(projectId: string, resource: string, id: string) {
    return this.table(projectId, resource).delete(id);
  }
  async clearRecords(projectId: string, resource?: string) {
    if (resource) this.records.get(projectId)?.delete(resource);
    else this.records.delete(projectId);
  }

  async appendLog(projectId: string, entry: LogEntry) {
    let l = this.logs.get(projectId);
    if (!l) this.logs.set(projectId, (l = []));
    l.push(entry);
    if (l.length > MAX_LOGS_PER_PROJECT) l.splice(0, l.length - MAX_LOGS_PER_PROJECT);
  }
  async getLogs(projectId: string, limit: number) {
    return [...(this.logs.get(projectId) ?? [])].reverse().slice(0, limit);
  }
  async close() {}
}
