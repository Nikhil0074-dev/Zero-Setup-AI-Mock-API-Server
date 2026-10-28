# API reference

All bodies are JSON. Errors: `{ "error": CODE, "message": string, "details"?: [{field, message}] }`.

## Management (`/api/*`, optional bearer token)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status, uptimeSeconds, aiProvider, store}` (no auth) |
| POST | `/api/generate` | `{name?, description, apiType?}` → `{definition, schemas, provider, attempts}`; nothing is activated. Rate-limited. 422 `AI_OUTPUT_INVALID`, 502/504 provider errors |
| GET | `/api/fixtures`, `/api/fixtures/:name` | Bundled definitions |
| POST | `/api/projects` | `{name, id?, description?, ttlMinutes?, activate?}` plus exactly one of `definition` / `fixture` / `prompt` → 201 project. 409 duplicate or limit, 422 invalid definition |
| GET | `/api/projects` | List |
| GET | `/api/projects/:id` | Project incl. definition |
| PUT | `/api/projects/:id` | `{name?, description?, definition?, ttlMinutes?}`; changed resources are re-seeded |
| DELETE | `/api/projects/:id` | 204; removes routes, data, logs |
| GET | `/api/projects/:id/endpoints` | Endpoints with URL, path params, expected status |
| GET | `/api/projects/:id/schemas` | Derived JSON Schemas per resource |
| POST | `/api/projects/:id/activate` · `/deactivate` · `/reset` | Lifecycle; reset restores seed data |
| GET | `/api/projects/:id/logs?limit=` | Newest first (max 200) |
| GET/POST | `/api/projects/:id/export` | `format=definition` (default) or `openapi` |

## Mock runtime (`/mock/:projectId/<basePath>/…`, open)
Behaviors: `list` (GET), `getById` (GET), `create` (POST → 201), `update` (PATCH/PUT), `delete` (DELETE → 204), `static` (fixed JSON; optional `requestSchema`). List endpoints accept `page`, `limit`, `sort`, `order`, `q`, `<field>`, `<field>_min`, `<field>_max`; optional `scope: {param, field}` restricts a nested list (e.g. `/users/:userId/orders`).

## Definition example
```json
{ "name":"Things","version":"1.0.0","apiType":"REST","basePath":"/api",
  "resources":{"things":{"idPrefix":"thg","seedCount":5,"fields":{
     "name":{"type":"string","required":true,"faker":"commerce.productName"},
     "qty":{"type":"integer","min":0,"max":10}}}},
  "endpoints":[{"id":"list-things","method":"GET","path":"/things","behavior":"list","resource":"things"}] }
```
Field options: `type` (string|integer|number|boolean), `required`, `enum`, `min`/`max`, `minLength`/`maxLength`, `format` (email|date-time|date|uri), `faker` (allow-listed generator name).
