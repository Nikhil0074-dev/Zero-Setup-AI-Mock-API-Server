# Setup

Requires Node.js ≥ 20 (developed on 22).

```bash
npm install
npm run dev            # tsx watch, http://127.0.0.1:4000
# or
npm run build && npm start
```
Optional: copy `.env.example` to `.env` and export the variables (the server reads the process environment; it does not load `.env` itself — use `node --env-file=.env apps/server/dist/index.js` on Node ≥ 20.6).

## Troubleshooting
- *Port in use* → `PORT=4100 npm start`.
- *`STORE=redis requires ioredis`* → `npm install ioredis --workspace apps/server` (it is an optional dependency).
- *`AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY`* → set the key or use `AI_PROVIDER=auto`.
- *401 in the dashboard* → `ADMIN_TOKEN` is set; enter it when prompted.
- *Everything vanished after restart* → expected with in-memory storage.
