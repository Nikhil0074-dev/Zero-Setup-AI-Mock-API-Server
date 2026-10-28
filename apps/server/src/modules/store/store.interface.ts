import type { LogEntry, MockRecord, Project } from '../../types';

/** Storage contract implemented by every adapter (memory, Redis, ...). */
export interface MockStore {
  saveProject(project: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  /** Removes the project together with its records and logs. */
  deleteProject(id: string): Promise<void>;

  setRecords(projectId: string, resource: string, records: MockRecord[]): Promise<void>;
  listRecords(projectId: string, resource: string): Promise<MockRecord[]>;
  countRecords(projectId: string, resource: string): Promise<number>;
  getRecord(projectId: string, resource: string, id: string): Promise<MockRecord | null>;
  insertRecord(projectId: string, resource: string, record: MockRecord): Promise<void>;
  /** Merge `patch` into an existing record. Returns the updated record, or null when missing. */
  updateRecord(projectId: string, resource: string, id: string, patch: Record<string, unknown>): Promise<MockRecord | null>;
  removeRecord(projectId: string, resource: string, id: string): Promise<boolean>;
  /** Removes all records for one resource, or for every resource when omitted. */
  clearRecords(projectId: string, resource?: string): Promise<void>;

  appendLog(projectId: string, entry: LogEntry): Promise<void>;
  /** Newest first. */
  getLogs(projectId: string, limit: number): Promise<LogEntry[]>;

  close(): Promise<void>;
}
