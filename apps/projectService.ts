import type { Config } from '../../config';
import type { ApiDefinition, Project } from '../../types';
import { addMinutes, systemClock, type Clock } from '../../utils/dates';
import { HttpError } from '../../utils/errors';
import { PROJECT_ID_PATTERN, randomSuffix, slugify } from '../../utils/ids';
import { generateSeedRecords } from '../data/mockDataGenerator';
import { RouteRegistry } from '../runtime/routeRegistry';
import type { MockStore } from '../store/store.interface';
import { validateDefinition } from '../validation/definitionValidator';

export interface CreateProjectInput {
  id?: string;
  name: string;
  description?: string;
  definition: unknown;
  activate?: boolean;
  ttlMinutes?: number;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  definition?: unknown;
  ttlMinutes?: number;
}

type ProjectConfig = Pick<Config, 'maxProjects' | 'maxEndpoints' | 'maxResources' | 'maxSeedCount' | 'defaultTtlMinutes'>;

export class ProjectService {
  constructor(
    private readonly store: MockStore,
    private readonly registry: RouteRegistry,
    private readonly config: ProjectConfig,
    private readonly clock: Clock = systemClock
  ) {}

  /** Validates an untrusted definition; throws 422 with details when it is not acceptable. */
  assertValidDefinition(input: unknown): ApiDefinition {
    const result = validateDefinition(input, this.config);
    if (!result.valid) throw new HttpError(422, 'INVALID_DEFINITION', 'The API definition is invalid.', result.issues);
    return input as ApiDefinition;
  }

  private expiry(ttlMinutes: number | undefined): string | null {
    const ttl = ttlMinutes ?? this.config.defaultTtlMinutes;
    return ttl > 0 ? addMinutes(this.clock(), ttl).toISOString() : null;
  }

  private async seed(projectId: string, def: ApiDefinition, only?: string[]) {
    for (const [name, res] of Object.entries(def.resources)) {
      if (only && !only.includes(name)) continue;
      const records = generateSeedRecords(name, res, res.seedCount ?? 10, def.seed ?? 1);
      await this.store.setRecords(projectId, name, records);
    }
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const definition = this.assertValidDefinition(input.definition);
    if ((await this.store.listProjects()).length >= this.config.maxProjects)
      throw new HttpError(409, 'LIMIT_EXCEEDED', `At most ${this.config.maxProjects} projects can exist at once.`);

    let id = input.id;
    if (id !== undefined) {
      if (!PROJECT_ID_PATTERN.test(id))
        throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid project id.', [{ field: 'id', message: 'Use 2-41 lowercase letters, digits or hyphens.' }]);
      if (await this.store.getProject(id)) throw new HttpError(409, 'PROJECT_EXISTS', `A project with id "${id}" already exists.`);
    } else {
      do id = `${slugify(input.name)}-${randomSuffix(2)}`;
      while (await this.store.getProject(id));
    }

    const now = this.clock().toISOString();
    const project: Project = {
      id,
      name: input.name,
      description: input.description ?? definition.description ?? '',
      status: input.activate === false ? 'inactive' : 'active',
      definition,
      createdAt: now,
      updatedAt: now,
      expiresAt: this.expiry(input.ttlMinutes)
    };
    await this.store.saveProject(project);
    await this.seed(id, definition);
    this.registry.invalidate(id);
    return project;
  }

  async get(id: string): Promise<Project> {
    const p = await this.store.getProject(id);
    if (!p) throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project "${id}" was not found.`);
    return p;
  }

  async list(): Promise<Project[]> {
    return (await this.store.listProjects()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, patch: UpdateProjectInput): Promise<Project> {
    const project = await this.get(id);
    if (patch.name !== undefined) project.name = patch.name;
    if (patch.description !== undefined) project.description = patch.description;
    if (patch.ttlMinutes !== undefined) project.expiresAt = this.expiry(patch.ttlMinutes);
    if (patch.definition !== undefined) {
      const next = this.assertValidDefinition(patch.definition);
      const old = project.definition;
      const changed: string[] = [];
      for (const [name, res] of Object.entries(next.resources))
        if (!old.resources[name] || JSON.stringify(old.resources[name]) !== JSON.stringify(res)) changed.push(name);
      for (const name of Object.keys(old.resources)) if (!next.resources[name]) await this.store.clearRecords(id, name);
      project.definition = next;
      await this.seed(id, next, changed);
    }
    project.updatedAt = this.clock().toISOString();
    await this.store.saveProject(project);
    this.registry.invalidate(id);
    return project;
  }

  async setStatus(id: string, status: Project['status']): Promise<Project> {
    const project = await this.get(id);
    project.status = status;
    project.updatedAt = this.clock().toISOString();
    await this.store.saveProject(project);
    return project;
  }

  /** Discard all simulated changes and regenerate the seed data. */
  async reset(id: string): Promise<Project> {
    const project = await this.get(id);
    await this.store.clearRecords(id);
    await this.seed(id, project.definition);
    return project;
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.store.deleteProject(id);
    this.registry.invalidate(id);
  }

  isExpired(project: Project): boolean {
    return project.expiresAt !== null && new Date(project.expiresAt).getTime() <= this.clock().getTime();
  }

  /** Used by the mock runtime: the environment must exist, be active and not be expired. */
  async getRuntimeProject(id: string): Promise<Project> {
    const project = await this.store.getProject(id);
    if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', `Mock environment "${id}" was not found.`);
    if (this.isExpired(project)) throw new HttpError(410, 'ENVIRONMENT_EXPIRED', `Mock environment "${id}" has expired.`);
    if (project.status !== 'active') throw new HttpError(503, 'ENVIRONMENT_INACTIVE', `Mock environment "${id}" is not active.`);
    return project;
  }

  /** Deletes expired environments. Returns the ids removed. */
  async sweepExpired(): Promise<string[]> {
    const removed: string[] = [];
    for (const p of await this.store.listProjects()) {
      if (this.isExpired(p)) {
        await this.store.deleteProject(p.id);
        this.registry.invalidate(p.id);
        removed.push(p.id);
      }
    }
    return removed;
  }
}
