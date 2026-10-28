/** JSON Schema describing a valid ApiDefinition. The runtime only ever executes configuration that passes this. */
const fieldSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { enum: ['string', 'integer', 'number', 'boolean'] },
    required: { type: 'boolean' },
    enum: { type: 'array', minItems: 1, maxItems: 50, items: { type: ['string', 'number'] } },
    min: { type: 'number' },
    max: { type: 'number' },
    minLength: { type: 'integer', minimum: 0, maximum: 10000 },
    maxLength: { type: 'integer', minimum: 0, maximum: 10000 },
    format: { enum: ['email', 'date-time', 'date', 'uri'] },
    faker: { type: 'string', maxLength: 60 },
    description: { type: 'string', maxLength: 300 }
  }
};

const resourceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    idPrefix: { type: 'string', pattern: '^[a-z][a-z0-9]{0,9}$' },
    fields: { type: 'object', minProperties: 1, maxProperties: 30, additionalProperties: fieldSchema },
    seedCount: { type: 'integer', minimum: 0 },
    filterable: { type: 'array', maxItems: 30, items: { type: 'string' } },
    sortable: { type: 'array', maxItems: 30, items: { type: 'string' } }
  }
};

const endpointSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'method', 'path', 'behavior'],
  properties: {
    id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,60}$' },
    method: { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    path: { type: 'string', minLength: 1, maxLength: 200 },
    behavior: { enum: ['list', 'getById', 'create', 'update', 'delete', 'static'] },
    resource: { type: 'string' },
    summary: { type: 'string', maxLength: 200 },
    responseStatus: { type: 'integer', minimum: 200, maximum: 599 },
    scope: {
      type: 'object',
      additionalProperties: false,
      required: ['param', 'field'],
      properties: { param: { type: 'string' }, field: { type: 'string' } }
    },
    requestSchema: { type: 'object' },
    response: {
      type: 'object',
      additionalProperties: false,
      properties: { status: { type: 'integer', minimum: 200, maximum: 599 }, body: {} }
    }
  }
};

export const apiDefinitionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'version', 'apiType', 'basePath', 'resources', 'endpoints'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 1000 },
    version: { type: 'string', minLength: 1, maxLength: 30 },
    apiType: { const: 'REST' },
    basePath: { type: 'string', pattern: '^(/[A-Za-z0-9_-]+)*$', maxLength: 100 },
    seed: { type: 'integer' },
    resources: { type: 'object', additionalProperties: resourceSchema },
    endpoints: { type: 'array', minItems: 1, items: endpointSchema }
  }
} as const;
