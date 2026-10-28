# Security model

| Risk | Control | Verified by |
|---|---|---|
| Executing AI output | Definitions are data; `behavior` selects from a fixed handler table; additional properties are rejected; `$ref`/unknown schema keywords rejected; no `eval`/`Function`/dynamic import | `ai.test.ts` ("smuggle code"), `definitionValidator.test.ts` |
| Prototype pollution | Reserved names rejected; handler lookup uses `hasOwnProperty`; params are null-prototype objects; records stored in `Map`s | `mockRuntime.test.ts` (`__proto__`, `constructor`) |
| Cross-environment access | Every store call is keyed by project id; routes compiled per project | `mockRuntime.test.ts` (isolation) |
| Path traversal | Fixture names allow-listed; project ids pattern-checked | `misc.test.ts`, `management.test.ts` |
| Unprotected management API | `ADMIN_TOKEN` bearer auth (timing-safe) on `/api/*` | `management.test.ts` |
| Resource exhaustion | Body size, projects, endpoints, resources, seed size, records per resource, page size, rate limits, TTL + sweeper, bounded logs | integration tests |
| Secret leakage | AI key only in backend env, sent as header; logs hold no bodies/queries/headers; 500s are generic | `ai.test.ts`, `mockRuntime.test.ts`, `management.test.ts` |

Not covered: TLS (terminate at a reverse proxy), per-user authorization (single shared admin token), distributed rate limiting (limiter is per process), CSRF (token auth is header-based, not cookie-based). Mock endpoints intentionally send permissive CORS headers for browser front ends — do not put real data in them.
