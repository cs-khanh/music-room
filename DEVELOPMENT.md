# Music Room Development

## Structure

```txt
frontend/  Next.js app
backend/   NestJS API, Socket.IO gateway, Prisma
shared/    TypeScript contracts shared by frontend and backend
```

## Environment

Copy the example files before running the apps:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Important config is intentionally centralized:

- Frontend API URL: `frontend/config/env.ts`
- Frontend Socket.IO URL: `frontend/config/env.ts`
- Backend runtime config: Nest `ConfigModule`
- Backend database URL: `backend/prisma/schema.prisma`
- YouTube Data API v3 key: backend-only `YOUTUBE_API_KEY`

Do not hard-code API or websocket URLs inside components, services, controllers, or gateways.

## Design Standard

Use the installed `design-taste-frontend` skill for frontend design work:

```txt
.agents/skills/design-taste-frontend/SKILL.md
```

Install or update it with:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

The skill is strongest for landing pages, portfolios, and redesigns. For Music Room, apply its design-read, spacing, typography, hierarchy, anti-generic layout, and motion guidance to the public Home, Auth, Room, and Profile screens while preserving the product UI rules from `README_music_room.md`.

Default design read for this project:

```txt
Reading this as: consumer music web app for casual listeners and room hosts, with a dark premium media-product language, leaning toward Tailwind-owned components, restrained glass, strong album-art surfaces, and smooth but purposeful motion.
```

## YouTube API Key

Music Room uses YouTube Data API v3 only from the backend. The frontend must never receive the API key.

Set this in `backend/.env`:

```env
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```

The backend reads it through Nest `ConfigService` in `backend/src/youtube/youtube.service.ts`. Frontend code should call internal backend endpoints instead:

```txt
GET /youtube/search?q=lofi
GET /youtube/videos/:videoId
```

## Commands

```bash
npm install
npm run typecheck -ws
npm run build -w shared
npm run build -w backend
npm run build -w frontend
npm run dev:frontend
npm run dev:backend
```

## Prisma

```bash
npx prisma validate --schema backend/prisma/schema.prisma
npx prisma generate --schema backend/prisma/schema.prisma
npm run prisma:migrate -w backend
```

The schema follows the database design from `README_music_room.md` and keeps room player state in the `rooms` table.
