export type FieldType = 'string' | 'integer' | 'number' | 'boolean';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Behavior = 'list' | 'getById' | 'create' | 'update' | 'delete' | 'static';

export interface FieldDef {
  type: FieldType;
  required?: boolean;
  enum?: Array<string | number>;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  format?: 'email' | 'date-time' | 'date' | 'uri';
  faker?: string;
  description?: string;
}

export interface ResourceDef {
  idPrefix?: string;
  fields: Record<string, FieldDef>;
  seedCount?: number;
  filterable?: string[];
  sortable?: string[];
}

export interface EndpointDef {
  id: string;
  method: HttpMethod;
  path: string;
  behavior: Behavior;
  resource?: string;
  summary?: string;
  responseStatus?: number;
  /** For `list`: restrict records to those whose `field` equals the path parameter `param`. */
  scope?: { param: string; field: string };
  /** Optional JSON Schema for the request body (overrides the generated one). */
  requestSchema?: Record<string, unknown>;
  /** For `static` endpoints: a fixed JSON response. */
  response?: { status?: number; body?: unknown };
}

export interface ApiDefinition {
  name: string;
  description?: string;
  version: string;
  apiType: 'REST';
  basePath: string;
  seed?: number;
  resources: Record<string, ResourceDef>;
  endpoints: EndpointDef[];
}

export type MockRecord = { id: string } & Record<string, unknown>;

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  definition: ApiDefinition;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface LogEntry {
  timestamp: string;
  projectId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  endpointId: string | null;
}

export interface ValidationIssue {
  field: string;
  message: string;
}
