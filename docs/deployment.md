# Deployment

```bash
docker build -t zero-setup-mock-api .
docker run -p 4000:4000 -e ADMIN_TOKEN=change-me zero-setup-mock-api
```
(The Dockerfile has not been built in the authoring environment; verify on your machine.)

For anything reachable by others:
1. Set `ADMIN_TOKEN` and put the service behind HTTPS.
2. Set `DEFAULT_TTL_MINUTES` so abandoned environments expire.
3. Memory storage = single instance, state lost on restart. For several instances or persistence use `STORE=redis` (note the non-atomic update caveat in README).
4. Tune `MOCK_RATE_PER_MINUTE`, `MAX_PROJECTS`, `MAX_RECORDS_PER_RESOURCE` to your host size.
