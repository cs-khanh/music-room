# Cloudflare D1 backend

> The canonical setup, deployment, secret management, data migration, and troubleshooting instructions are in the repository's [CLOUDFLARE.md](../../CLOUDFLARE.md). This file describes the Worker implementation and local backend details.

`migrations/0001_initial.sql` is the SQLite/D1 counterpart of the Prisma MySQL schema. The NestJS app and MySQL schema remain available for local fallback; Cloudflare requests use the Worker and D1 binding.

## Behavior migrated

`../worker.js` implements the current REST routes for authentication, rooms and membership, queue, player sync, personal history/favorites, and YouTube search/video lookups. Responses keep the existing JSON shapes and NestJS POST status codes. Authentication/authorization rules are preserved for room owners, root owners, members, and song-add/remove settings.

Writes that previously used Prisma transactions are implemented using D1 `batch()` operations or conditional SQL. A Durable Object per room replaces Socket.IO room coordination with native WebSockets. `frontend/lib/socket-client.ts` keeps the existing `on`/`off`/`emit` API and event names so the room UI keeps its current interaction flow.

`scripts/cf-smoke.mjs` exercises auth, room membership permissions, owner promotion/demotion, realtime join/player updates, room listing, and deletion against Wrangler local. YouTube tests need a real API key and are not part of the smoke run.

## Local development

Wrangler reads local Worker variables from `backend/d1/.dev.vars`. Create it with values like these; do not commit real values:

```dotenv
JWT_SECRET=<random secret of at least 32 bytes>
JWT_REFRESH_SECRET=<a different random secret of at least 32 bytes>
YOUTUBE_API_KEY=<YouTube Data API v3 key>
FRONTEND_URL=http://localhost:3000
```

Then run:

```bash
npm run cf:d1:local --workspace backend
npm run cf:dev --workspace backend -- --port 8790
npm run cf:smoke --workspace backend
```

The local D1 database and local secrets are separate from the remote test Worker/database.

## Copying MySQL data

The Worker code does not migrate rows automatically. With the existing MySQL `DATABASE_URL` available to Prisma, run `npm run cf:data:export --workspace backend -- d1/mysql-export.sql`. The exporter preserves primary keys and writes room pointers after queue rows so the D1 foreign keys remain valid. The generated file contains personal data and password hashes; it is git-ignored. Review table row counts and import only into an empty D1 database. The exporter does not contact or write to Cloudflare.

## Test deploy configuration

Before deploying, configure `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `YOUTUBE_API_KEY` as Worker secrets. Set `FRONTEND_URL` to the deployed frontend origin (a comma-separated list is accepted for multiple origins). Keep JWT secrets distinct and at least 32 bytes. Apply remote test schema with `npm run cf:test:d1:migrate --workspace backend`, then deploy with `npm run cf:deploy --workspace backend`. This does not copy MySQL data or switch frontend traffic.

## Production environment

Production is isolated from test: `music-room-api` uses `music-room-prod-db` through `wrangler.production.jsonc`. Apply its schema with `npm run cf:prod:d1:migrate --workspace backend`, then deploy with `npm run cf:prod:deploy --workspace backend`. Secrets are scoped per Worker, so production needs its own `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `YOUTUBE_API_KEY`; use fresh JWT secrets distinct from test. `FRONTEND_URL` is configured for the production origin in Wrangler. Applying schema does not migrate MySQL rows; follow the data migration and account/password strategy in `CLOUDFLARE.md` before moving existing users.

## Cutover constraints

- Applying D1 schema does not copy MySQL rows. Check the actual source and target row counts before any cutover.
- NestJS stores passwords as bcrypt. The Worker uses PBKDF2-SHA256 with 100,000 iterations, the highest accepted by Workers Web Crypto in the deployed test. Existing bcrypt hashes cannot be converted without the user's password; [Workers Free allows 10 ms CPU per request](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), so bcrypt compatibility is not a safe assumption. Plan an explicit password reset/migration or a paid compatibility path before moving existing accounts.
- Keep production MySQL and the NestJS server as rollback sources until importing data and end-to-end testing the deployed frontend.
