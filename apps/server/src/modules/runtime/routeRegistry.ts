import type { ValidateFunction } from 'ajv';
import { buildResourceSchemas } from '../generator/schemaGenerator';
import { compileSchema } from '../validation/schemaValidator';
import type { ApiDefinition, EndpointDef, Project } from '../../types';
import { compileRoute, type CompiledRoute } from './routeMatcher';

export interface CompiledEndpoint {
  def: EndpointDef;
  route: CompiledRoute;
  validateBody?: ValidateFunction;
}

export interface CompiledApi {
  definition: ApiDefinition;
  endpoints: CompiledEndpoint[];
}

export function compileApi(definition: ApiDefinition): CompiledApi {
  const schemaCache = new Map<string, ReturnType<typeof buildResourceSchemas>>();
  const schemasFor = (r: string) => {
    let s = schemaCache.get(r);
    if (!s) schemaCache.set(r, (s = buildResourceSchemas(definition.resources[r]!)));
    return s;
  };
  const endpoints = definition.endpoints.map<CompiledEndpoint>((def) => {
    let schema: object | undefined = def.requestSchema;
    if (!schema && def.resource && def.behavior === 'create') schema = schemasFor(def.resource).create;
    if (!schema && def.resource && def.behavior === 'update') schema = schemasFor(def.resource).update;
    return { def, route: compileRoute(`${definition.basePath}${def.path}`), validateBody: schema ? compileSchema(schema) : undefined };
  });
  return { definition, endpoints };
}

/** Holds compiled (validated + schema-compiled) endpoint tables, keyed by project and version. */
export class RouteRegistry {
  private cache = new Map<string, { updatedAt: string; api: CompiledApi }>();

  get(project: Project): CompiledApi {
    const hit = this.cache.get(project.id);
    if (hit && hit.updatedAt === project.updatedAt) return hit.api;
    const api = compileApi(project.definition);
    this.cache.set(project.id, { updatedAt: project.updatedAt, api });
    return api;
  }

  invalidate(projectId: string): void {
    this.cache.delete(projectId);
  }

  has(projectId: string): boolean {
    return this.cache.has(projectId);
  }
}
