import type { ValidationIssue } from '../../types';

export const SYSTEM_PROMPT = `You design mock REST APIs. Reply with ONE JSON object and nothing else (no prose, no code fences).
The JSON is declarative configuration, never code. It must follow this shape exactly:
{
  "name": string, "description": string, "version": "1.0.0", "apiType": "REST", "basePath": "/api",
  "resources": {
    "<plural_camelCase_name>": {
      "idPrefix": "3-4 lowercase letters", "seedCount": integer 5-30,
      "fields": { "<fieldName>": { "type": "string"|"integer"|"number"|"boolean", "required": boolean,
        "enum": [..]?, "min": n?, "max": n?, "minLength": n?, "maxLength": n?,
        "format": "email"|"date-time"|"date"|"uri"?, "faker": "<generator>"? } },
      "filterable": [fieldNames]?, "sortable": [fieldNames]?
    }
  },
  "endpoints": [ { "id": "unique-id", "method": "GET|POST|PUT|PATCH|DELETE", "path": "/resource/:id",
    "behavior": "list|getById|create|update|delete|static", "resource": "<resource name>", "summary": string,
    "responseStatus": integer?, "scope": {"param": "userId", "field": "userId"}?,
    "requestSchema": JSON Schema?, "response": {"status": integer, "body": any}? } ]
}
Rules:
- Behaviors: list (GET collection), getById (GET /x/:id), create (POST), update (PATCH or PUT /x/:id), delete (DELETE /x/:id), static (fixed JSON response, no resource; use for login or other simulated actions).
- Field names must not be id, createdAt or updatedAt (they are added automatically). Use camelCase names.
- "faker" must be one of: person.fullName, person.firstName, person.lastName, internet.email, internet.url, internet.username, phone.number, location.city, location.country, location.streetAddress, company.name, commerce.productName, commerce.department, commerce.price, lorem.words, lorem.sentence, lorem.paragraph, string.uuid, date.past, date.future, date.birthdate, datatype.boolean, number.int.
- Paths must start with "/" and not repeat the basePath. At most 40 endpoints and 12 resources.
- Include list/getById/create/update/delete for each resource unless the user asks for fewer.
- Never include executable code, scripts, URLs to fetch, or $ref in schemas.`;

export function buildUserPrompt(name: string | undefined, description: string): string {
  return `${name ? `API name: ${name}\n` : ''}Requirements:\n${description}`;
}

export function buildRepairPrompt(previous: string, issues: ValidationIssue[]): string {
  const list = issues.slice(0, 15).map((i) => `- ${i.field}: ${i.message}`).join('\n');
  return `Your previous JSON was rejected by the validator.\nPrevious output:\n${previous.slice(0, 6000)}\n\nProblems:\n${list}\n\nReturn a corrected, complete JSON object only.`;
}
