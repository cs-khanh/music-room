# Run Music Room Locally

## Prerequisites

- Node.js 20+
- npm
- MySQL 8, or Docker if you want to run MySQL in a container
- YouTube Data API v3 key

## 1. Install Dependencies

```bash
npm install
```

If PowerShell blocks `npm`, use:

```bash
npm.cmd install
```

## 2. Configure Environment

The local env files already exist:

```txt
frontend/.env.local
backend/.env
```

Frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

Backend:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000
DATABASE_URL="mysql://root:root@localhost:3306/music_room"
JWT_ACCESS_SECRET=local-dev-access-secret-change-before-production
JWT_REFRESH_SECRET=local-dev-refresh-secret-change-before-production
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
REDIS_URL=redis://localhost:6379
```

Only set `YOUTUBE_API_KEY` in `backend/.env`. Do not expose it in the frontend.

## 3. Start MySQL

If you use Docker:

```bash
docker run --name music-room-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=music_room -p 3306:3306 -d mysql:8
```

If the container already exists:

```bash
docker start music-room-mysql
```

If you use an existing MySQL server, update `DATABASE_URL` in `backend/.env`.

## 4. Generate Prisma Client

```bash
npx prisma generate --schema backend/prisma/schema.prisma
```

## 5. Run Database Migration

```bash
npm run prisma:migrate -w backend
```

## 6. Run Backend

Open a terminal:

```bash
npm run dev:backend
```

Backend runs at:

```txt
http://localhost:3001
```

## 7. Run Frontend

Open another terminal:

```bash
npm run dev:frontend
```

Frontend runs at:

```txt
http://localhost:3000
```

## Useful Checks

```bash
npm run typecheck -ws
npm run build -w backend
npm run build -w frontend
npx prisma validate --schema backend/prisma/schema.prisma
```

## Basic Flow To Test

1. Open `http://localhost:3000/register`.
2. Create an account.
3. Open `http://localhost:3000`.
4. Create or join a room through the API/UI as features are connected.
5. Open `http://localhost:3000/room/YOUR_CODE`.
6. Search YouTube and add songs to the queue.

## Common Issues

### PowerShell blocks npm

Use `npm.cmd` instead:

```bash
npm.cmd run dev:frontend
npm.cmd run dev:backend
```

### Backend cannot connect to MySQL

Check that MySQL is running and `DATABASE_URL` is correct:

```bash
docker ps
```

### YouTube search returns config error

Set a real key:

```env
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```

### Frontend build works in terminal but not inside Codex

Next.js spawns worker processes during build. In restricted sandboxes this can fail with `spawn EPERM`. Run the build from your normal terminal:

```bash
npm run build -w frontend
```
