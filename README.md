# Music Room

Music Room is a YouTube listening app with personal playback and synchronized rooms. The deployed architecture uses Cloudflare Workers, D1, Durable Objects, and a Next.js frontend built with OpenNext.

## Cloudflare architecture

- Frontend Worker: `music-room-frontend`, deployed to `music.khanhcs.id.vn`.
- API Worker: `music-room-api`, deployed to `api-music.khanhcs.id.vn`.
- Test API Worker: `music-room-api-test`.
- D1 stores accounts, rooms, queues, favorites, history, and YouTube cache data.
- A Durable Object coordinates WebSocket events for each room.
- The Cloudflare API implementation is `backend/worker.js`; the original NestJS/MySQL implementation is retained for local fallback and data export.

## Start here

- [Cloudflare deployment and operations](CLOUDFLARE.md): prerequisites, local D1, secrets, test/production deployment, MySQL data migration, and troubleshooting.
- [Cloudflare D1 backend notes](backend/d1/README.md): Worker behavior and local backend details.
- [Product requirements and original architecture](README_music_room.md).
- [Original local NestJS + MySQL setup](RUN_PROJECT.md).
- [Cloudflare migration plan and decision history](music-room-cloudflare-migration-plan.md).

## Quick start

Install dependencies from the repository root:

```sh
npm ci
```

For local Cloudflare development, configure `backend/d1/.dev.vars` from `backend/d1/.dev.vars.example`, then start the API and frontend as described in [CLOUDFLARE.md](CLOUDFLARE.md#local-cloudflare-development).

Do not commit local environment files, Worker secrets, or database exports. The `NEXT_PUBLIC_*` frontend URLs are public build-time configuration; `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `YOUTUBE_API_KEY` belong in Cloudflare Worker secrets.
