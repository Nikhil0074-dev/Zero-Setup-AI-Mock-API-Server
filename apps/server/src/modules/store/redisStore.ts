import type { LogEntry, MockRecord, Project } from '../../types';
import type { MockStore } from './store.interface';

/** The subset of the ioredis API used by this adapter (lets tests inject ioredis-mock). */
export interface RedisLike {
  hset(key: string, field: string, value: string): Promise<unknown>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  hlen(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  lpush(key: string, ...values: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  quit(): Promise<unknown>;
}

const MAX_LOGS = 500;

/**
 * Optional shared-state adapter. Layout:
 *   mock:projects            hash  id -> Project JSON
 *   mock:rec:<pid>:<res>     hash  recordId -> record JSON
 *   mock:logs:<pid>          list  newest first
 * Note: updateRecord is a read-modify-write and is not atomic across several server instances.
 */
export class RedisStore implements MockStore {
  constructor(private readonly redis: RedisLike) {}

  private rec = (pid: string, res: string) => `mock:rec:${pid}:${res}`;

  async saveProject(p: Project) {
    await this.redis.hset('mock:projects', p.id, JSON.stringify(p));
  }
  async getProject(id: string) {
    const raw = await this.redis.hget('mock:projects', id);
    return raw ? (JSON.parse(raw) as Project) : null;
  }
  async listProjects() {
    return Object.values(await this.redis.hgetall('mock:projects')).map((v) => JSON.parse(v) as Project);
  }
  async deleteProject(id: string) {
    await this.redis.hdel('mock:projects', id);
    const keys = await this.redis.keys(`mock:rec:${id}:*`);
    if (keys.length) await this.redis.del(...keys);
    await this.redis.del(`mock:logs:${id}`);
  }

  async setRecords(pid: string, res: string, records: MockRecord[]) {
    await this.redis.del(this.rec(pid, res));
    for (const r of records) await this.redis.hset(this.rec(pid, res), r.id, JSON.stringify(r));
  }
  async listRecords(pid: string, res: string) {
    const all = await this.redis.hgetall(this.rec(pid, res));
    return Object.values(all).map((v) => JSON.parse(v) as MockRecord);
  }
  async countRecords(pid: string, res: string) {
    return this.redis.hlen(this.rec(pid, res));
  }
  async getRecord(pid: string, res: string, id: string) {
    const raw = await this.redis.hget(this.rec(pid, res), id);
    return raw ? (JSON.parse(raw) as MockRecord) : null;
  }
  async insertRecord(pid: string, res: string, record: MockRecord) {
    await this.redis.hset(this.rec(pid, res), record.id, JSON.stringify(record));
  }
  async updateRecord(pid: string, res: string, id: string, patch: Record<string, unknown>) {
    const existing = await this.getRecord(pid, res, id);
    if (!existing) return null;
    const next = { ...existing, ...patch, id } as MockRecord;
    await this.redis.hset(this.rec(pid, res), id, JSON.stringify(next));
    return next;
  }
  async removeRecord(pid: string, res: string, id: string) {
    return (await this.redis.hdel(this.rec(pid, res), id)) > 0;
  }
  async clearRecords(pid: string, res?: string) {
    if (res) await this.redis.del(this.rec(pid, res));
    else {
      const keys = await this.redis.keys(`mock:rec:${pid}:*`);
      if (keys.length) await this.redis.del(...keys);
    }
  }

  async appendLog(pid: string, entry: LogEntry) {
    await this.redis.lpush(`mock:logs:${pid}`, JSON.stringify(entry));
    await this.redis.ltrim(`mock:logs:${pid}`, 0, MAX_LOGS - 1);
  }
  async getLogs(pid: string, limit: number) {
    return (await this.redis.lrange(`mock:logs:${pid}`, 0, limit - 1)).map((v) => JSON.parse(v) as LogEntry);
  }
  async close() {
    await this.redis.quit();
  }
}
