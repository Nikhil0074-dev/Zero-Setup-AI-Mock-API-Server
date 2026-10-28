# Test report

Recorded 2026-10-25 on Node 22 / Vitest 5 / TypeScript 7, from a clean `npm ci` of the packaged zip.

| Check | Result |
|---|---|
| `npm run typecheck` (strict, src + tests) | 0 errors |
| `npm run build` | success |
| `npm test` | **268/268 passed** in 16 files |
| `python3 e2e/dashboard.e2e.py` (real Chromium against the built server) | **19/19 checks passed** |

## Unit and integration tests by file
| File | Passed / total |
|---|---|
| `integration/crud.test.ts` | 23/23 |
| `integration/management.test.ts` | 27/27 |
| `integration/mockRuntime.test.ts` | 30/30 |
| `unit/ai.test.ts` | 22/22 |
| `unit/definitionValidator.test.ts` | 33/33 |
| `unit/memoryStore.test.ts` | 16/16 |
| `unit/misc.test.ts` | 16/16 |
| `unit/mockDataGenerator.test.ts` | 10/10 |
| `unit/openApiGenerator.test.ts` | 5/5 |
| `unit/projectService.test.ts` | 13/13 |
| `unit/query.test.ts` | 26/26 |
| `unit/rateLimit.test.ts` | 2/2 |
| `unit/redisStore.test.ts` | 16/16 |
| `unit/responseBuilder.test.ts` | 5/5 |
| `unit/routeMatcher.test.ts` | 10/10 |
| `unit/schemaValidator.test.ts` | 14/14 |

## Defects found by testing and fixed during development
- Seeded data was not reproducible: Faker date generators are relative to "now". Fixed with a fixed reference date (`REF_DATE`).
- Plain-text request bodies reached validation instead of being rejected: Fastify's default `text/plain` parser removed, so non-JSON gets 415.
- Dashboard kept showing the previous response while a new request was in flight; it now shows "Sending…".
- "Copy as cURL" button was illegible inside the dark console (contrast); fixed.

## What was *not* verified
- Redis adapter runs against `ioredis-mock`, not a real Redis server.
- Anthropic provider is tested with a fake `fetch` (success, HTTP error, empty, timeout, network); no live API call was made.
- Docker image was not built.
- Only Chromium was used for browser tests.
