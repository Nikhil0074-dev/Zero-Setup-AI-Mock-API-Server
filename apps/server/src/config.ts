export interface Config {
  port: number;
  host: string;
  storeType: 'memory' | 'redis';
  redisUrl: string;
  aiProvider: 'auto' | 'anthropic' | 'rule-based';
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  aiTimeoutMs: number;
  maxBodyBytes: number;
  maxProjects: number;
  maxEndpoints: number;
  maxResources: number;
  maxSeedCount: number;
  maxRecordsPerResource: number;
  maxPageSize: number;
  defaultTtlMinutes: number;
  adminToken: string | undefined;
  generateRatePerMinute: number;
  mockRatePerMinute: number;
  logLevel: string;
}

type Env = Record<string, string | undefined>;

function int(env: Env, key: string, def: number, min = 0): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`Invalid ${key}: expected an integer >= ${min}, got "${raw}"`);
  return n;
}

function oneOf<T extends string>(env: Env, key: string, allowed: readonly T[], def: T): T {
  const raw = env[key];
  if (!raw) return def;
  if (!(allowed as readonly string[]).includes(raw)) throw new Error(`Invalid ${key}: expected one of ${allowed.join(', ')}`);
  return raw as T;
}

export function loadConfig(env: Env = process.env): Config {
  return {
    port: int(env, 'PORT', 4000, 0),
    host: env.HOST || '127.0.0.1',
    storeType: oneOf(env, 'STORE', ['memory', 'redis'] as const, 'memory'),
    redisUrl: env.REDIS_URL || 'redis://127.0.0.1:6379',
    aiProvider: oneOf(env, 'AI_PROVIDER', ['auto', 'anthropic', 'rule-based'] as const, 'auto'),
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    aiTimeoutMs: int(env, 'AI_TIMEOUT_MS', 30_000, 1),
    maxBodyBytes: int(env, 'MAX_BODY_BYTES', 100_000, 1),
    maxProjects: int(env, 'MAX_PROJECTS', 50, 1),
    maxEndpoints: int(env, 'MAX_ENDPOINTS', 50, 1),
    maxResources: int(env, 'MAX_RESOURCES', 20, 1),
    maxSeedCount: int(env, 'MAX_SEED_COUNT', 200, 0),
    maxRecordsPerResource: int(env, 'MAX_RECORDS_PER_RESOURCE', 5000, 1),
    maxPageSize: int(env, 'MAX_PAGE_SIZE', 100, 1),
    defaultTtlMinutes: int(env, 'DEFAULT_TTL_MINUTES', 0, 0),
    adminToken: env.ADMIN_TOKEN || undefined,
    generateRatePerMinute: int(env, 'GENERATE_RATE_PER_MINUTE', 10, 1),
    mockRatePerMinute: int(env, 'MOCK_RATE_PER_MINUTE', 1200, 1),
    logLevel: env.LOG_LEVEL || 'info'
  };
}
