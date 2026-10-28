# Architecture

One Node.js process, seven logical layers (as in the proposal):

| Layer | Code | Responsibility |
|---|---|---|
| Dashboard | `apps/web/public` | Prompt editor, review, endpoint explorer, schema viewer, request console, history, logs |
| Management API | `routes/projects|generation.routes.ts`, `modules/projects` | Create/update/delete environments, activate, reset, export |
| AI generation | `modules/ai` | `AiProvider` interface; Anthropic client; offline rule-based provider; validate-and-repair loop |
| Validation & registry | `modules/validation`, `schemas/`, `modules/runtime/routeRegistry.ts` | JSON-Schema structure check + semantic checks (routes, conflicts, limits); compiled-route cache |
| Mock runtime | `modules/runtime`, `routes/mockRuntime.routes.ts` | Match route → validate body → allowlisted handler → response |
| Data | `modules/data`, `modules/generator` | Faker seeding, filtering, sorting, pagination, derived JSON Schemas, OpenAPI |
| Storage | `modules/store` | `MockStore` interface; memory (default) and Redis adapters |

## Request path
`/mock/:projectId/*` → `ProjectService.getRuntimeProject` (exists? expired→410, inactive→503) → `RouteRegistry.get` (compiled once per project version) → `dispatch` (404 / 405 / most-specific route) → handler → `recordRequest` (method/path/status/duration only).

## Definition format
See `src/types.ts` and `src/schemas/apiDefinition.schema.ts`; samples in `apps/server/fixtures`. Request/response JSON Schemas for each resource are *derived* from field definitions (`generator/schemaGenerator.ts`), so documentation, validation and seed data cannot drift apart.

## Extending
- **New behavior**: add an entry to `HANDLERS` in `requestDispatcher.ts`, to the `behavior` enum, and to `definitionValidator.ts` rules.
- **New storage**: implement `MockStore`, run it through `tests/unit/storeContract.ts`.
- **New AI provider**: implement `AiProvider`.
- **GraphQL**: a second runtime can reuse `MockStore`, resource schemas and seed data.
