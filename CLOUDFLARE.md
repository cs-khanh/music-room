# Cloudflare deployment and operations

This is the current deployment guide for Music Room. The application runs as a Next.js Worker on Cloudflare Workers, an API Worker backed by D1, and one Durable Object per active room for WebSockets.

```text
Browser ── HTTPS/API ──> music-room-api Worker ──> D1
   │                              └──────────────> MusicRoom Durable Object per room
   └── HTTPS ──────────> music-room-frontend Worker (OpenNext)
```

Production domains configured in this repository:

- Frontend: `https://music.khanhcs.id.vn`
- API and WebSocket endpoint: `https://api-music.khanhcs.id.vn`
- Test API Worker: `music-room-api-test` (the `workers.dev` URL is shown by Wrangler after deploy)

The original NestJS + MySQL workflow remains documented in [RUN_PROJECT.md](RUN_PROJECT.md). Use this guide for Cloudflare deployments.

## Requirements

- Node.js 20 or later and npm.
- A Cloudflare account with Workers, D1, and Durable Objects enabled.
- Wrangler authentication: run `npx wrangler login` once on the deployment machine.
- The repository's Cloudflare resources already created: `music-room-test-db`, `music-room-prod-db`, and the test/production Worker names in `backend/d1/wrangler*.jsonc`.

Install dependencies from the repository root:

```sh
npm ci
```

Never commit `.env`, `.dev.vars`, API keys, JWT secrets, exported database rows, or database backups. The checked-in `backend/d1/.dev.vars.example` is only a template. `frontend/.env.production` is ignored; the production build script supplies the public API URLs itself.

## Local Cloudflare development

Create `backend/d1/.dev.vars` using the example and fill in local-only values:

```dotenv
JWT_SECRET=<random value with at least 32 bytes>
JWT_REFRESH_SECRET=<different random value with at least 32 bytes>
YOUTUBE_API_KEY=<YouTube Data API v3 key>
FRONTEND_URL=http://localhost:3000
```

Initialize local D1 and run the API Worker:

```sh
npm run cf:d1:local --workspace backend
npm run cf:dev --workspace backend -- --port 8790
```

In another terminal, run the frontend against the local API:

```sh
npm run dev:frontend
```

The frontend local defaults are `http://localhost:3001`, so for the local Worker use environment overrides when starting Next.js:

PowerShell:

```powershell
$env:NEXT_PUBLIC_API_URL='http://localhost:8790'
$env:NEXT_PUBLIC_SOCKET_URL='http://localhost:8790'
npm run dev:frontend
```

Run the backend smoke flow against Wrangler local (default `http://127.0.0.1:8790`):

```sh
npm run cf:smoke --workspace backend
```

The smoke script creates temporary users and rooms in local D1 and checks authorization and WebSocket events. It does not call YouTube.

## Test environment deploy

The `wrangler.jsonc` file under `backend/d1` selects the test Worker and test D1 database. Set secrets on that Worker (Wrangler prompts for each value):

```sh
npx wrangler secret put JWT_SECRET --config backend/d1/wrangler.jsonc
npx wrangler secret put JWT_REFRESH_SECRET --config backend/d1/wrangler.jsonc
npx wrangler secret put YOUTUBE_API_KEY --config backend/d1/wrangler.jsonc
npx wrangler secret put FRONTEND_URL --config backend/d1/wrangler.jsonc
```

For `FRONTEND_URL`, enter the exact browser origin, including `https://` and without a trailing slash. The Worker accepts a comma-separated list if both local/test and production origins are intentionally needed.

Apply database migrations and deploy the test API:

```sh
npm run cf:test:d1:migrate --workspace backend
npm run cf:deploy --workspace backend
```

The migration command uses the remote **test** D1 database. The deploy command targets only the test API Worker. It does not export or import application rows from MySQL.

To deploy the frontend to its configured production custom domain:

```sh
npm run cf:build --workspace frontend
npm run cf:deploy --workspace frontend
```

`cf:deploy` builds with OpenNext and then deploys `frontend/wrangler.jsonc`. The build embeds the public API and WebSocket URL, so these values are visible to every browser and must never contain secrets. The frontend deploy targets `music.khanhcs.id.vn`; use it only after confirming the API/domain configuration is the intended target.

### Preview on Windows

The Next.js/OpenNext build can succeed on Windows while `opennextjs-cloudflare preview` fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME` due to a Windows drive path (`E:`). Use WSL for OpenNext preview, or deploy the build to a test Worker and verify it there. This does not prevent the `cf:build` step from producing the Worker bundle.

## Production API deploy

Production uses `backend/d1/wrangler.production.jsonc`, which binds `music-room-prod-db` and the custom API domain. Production secrets are separate from test secrets; set fresh values on the production Worker:

```sh
npx wrangler secret put JWT_SECRET --config backend/d1/wrangler.production.jsonc
npx wrangler secret put JWT_REFRESH_SECRET --config backend/d1/wrangler.production.jsonc
npx wrangler secret put YOUTUBE_API_KEY --config backend/d1/wrangler.production.jsonc
```

The production frontend origin is stored as the non-secret `FRONTEND_URL` variable in the Wrangler config. Deploy the API schema and Worker:

```sh
npm run cf:prod:d1:migrate --workspace backend
npm run cf:prod:deploy --workspace backend
```

Confirm the production API is healthy before deploying or switching the frontend. Keep test and production commands/configs distinct; the test deploy script never deploys the production API.

## MySQL data migration

Deploying code and applying a D1 schema migration do not move MySQL rows. The exporter reads the MySQL database through Prisma and writes a local SQL file containing account data and password hashes:

```sh
npm run cf:data:export --workspace backend -- d1/mysql-export.sql
```

Review the generated SQL and source/target row counts before importing. Import only into the intended empty database, and use the matching config explicitly:

```sh
# Remote test database
npx wrangler d1 execute music-room-test-db --remote --file d1/mysql-export.sql --config d1/wrangler.jsonc

# Remote production database (only when production data migration is approved)
npx wrangler d1 execute music-room-prod-db --remote --file d1/mysql-export.sql --config d1/wrangler.production.jsonc
```

The export contains personal data and password hashes. Store it securely, do not commit it, and delete it from the machine when no longer required. Never import the same export twice: primary keys and unique constraints will conflict, and a partial import needs a deliberate recovery plan.

NestJS accounts use bcrypt password hashes. The Cloudflare Worker currently uses PBKDF2 for new passwords, so existing accounts need an explicit password migration/reset strategy before production cutover. Do not assume changing the database alone preserves logins.

## Frontend variables and secrets

| Value | Where it belongs | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Frontend build environment; currently set by `frontend/scripts/cf-production.mjs` | No, exposed in browser bundle |
| `NEXT_PUBLIC_SOCKET_URL` | Frontend build environment; currently set by `frontend/scripts/cf-production.mjs` | No, exposed in browser bundle |
| `JWT_SECRET` | Cloudflare Worker secret, separately for test and production | Yes |
| `JWT_REFRESH_SECRET` | Cloudflare Worker secret, separately for test and production | Yes |
| `YOUTUBE_API_KEY` | Cloudflare Worker secret, separately for test and production | Yes |
| `FRONTEND_URL` | Local `.dev.vars` or Worker config/secret | Origin value; not a credential |

## Troubleshooting

- **Browser reports CORS errors:** check the API Worker has `FRONTEND_URL` set to the exact frontend origin and redeploy/restart it. CORS errors can hide the actual API response, so also inspect the API request status in DevTools.
- **API returns 403:** check the Worker logs and request URL. Confirm the right Worker/custom domain is deployed and that the request is not blocked by Cloudflare security rules. A CORS message alone does not prove the API's underlying error is CORS.
- **WebSocket does not connect:** ensure the frontend uses `https://` for its socket base URL (the client converts it to `wss://`), the API route is active, and the browser origin is allowed.
- **YouTube search fails:** set `YOUTUBE_API_KEY` on the Worker receiving the request; frontend variables are not used for this key.
- **A deleted room's old code connects:** deleting the D1 room row does not delete the deterministic Durable Object ID. The Worker must reject room operations when D1 says the room does not exist; a newly created room reusing the same code addresses the same DO ID.
- **Windows preview throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`:** run preview in WSL as described above.

## Pre-release checklist

- [ ] Test and production Worker secrets are configured independently.
- [ ] The correct D1 migration has been applied to the selected environment.
- [ ] If migrating existing users, data and password compatibility have been explicitly handled.
- [ ] Test API and WebSocket flows pass before production deploy.
- [ ] CORS origin matches the deployed frontend URL exactly.
- [ ] Frontend build embeds the intended API URL.
- [ ] Production API and frontend are checked after deployment, including auth, search, room create/join/delete, queue/player updates, and WebSocket reconnect.
- [ ] MySQL/NestJS rollback path is retained until production data and login flows are verified.
