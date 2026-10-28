export const generateBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['description'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', minLength: 3, maxLength: 4000 },
    apiType: { enum: ['REST'] }
  }
} as const;

export const createProjectBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 1000 },
    apiType: { enum: ['REST'] },
    definition: { type: 'object' },
    fixture: { type: 'string', maxLength: 60 },
    prompt: { type: 'string', minLength: 3, maxLength: 4000 },
    activate: { type: 'boolean' },
    ttlMinutes: { type: 'integer', minimum: 0, maximum: 525600 }
  }
} as const;

export const updateProjectBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 1000 },
    definition: { type: 'object' },
    ttlMinutes: { type: 'integer', minimum: 0, maximum: 525600 }
  }
} as const;
