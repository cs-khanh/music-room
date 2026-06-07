# Music Room

Music Room is a web application for listening to music from YouTube in two modes:

- **Personal Listening**: users can listen from the home page without logging in.
- **Room Listening**: users can log in, create or join a room, add songs to a shared queue, and listen together with playback synchronized to the room owner.

The project uses **YouTube Data API v3** for searching and retrieving video metadata, and **YouTube IFrame Player API** for official YouTube playback inside the web app.

---

## 1. Project Goals

The goal is to build a clean, modern, and interactive music-room experience where users can:

- Search songs from YouTube.
- Listen personally without an account.
- Log in to create or join rooms.
- Join a room by room code or invite link.
- Add songs to a room playlist.
- Listen together with time synchronized to the room owner.
- Keep local volume preferences individually.
- Let only the room owner control playback and queue order.
- Automatically play the next song when the current song ends.
- Allow the owner to transfer ownership to another user.

---

## 2. Core Business Rules

### 2.1 Public Listening

Users can listen from the home page without logging in.

Allowed without login:

- Search songs.
- Play songs using YouTube IFrame Player.
- Build a personal queue locally.
- Store recently played songs in `localStorage`.

Not allowed without login:

- Create room.
- Join room.
- Add songs to room queue.
- Save history to account.
- Save favorites to account.

---

### 2.2 Room Listening Requires Login

Users must be authenticated to create or join a room.

Room features requiring login:

- Create room.
- Join room.
- Add song to room queue.
- Listen in synchronized room mode.
- View room members.
- Receive realtime player state.
- Receive realtime queue update.

---

### 2.3 Owner-Controlled Playback

Each room has one **owner**.

The owner is the source of control for room playback.

Only the owner can:

- Play.
- Pause.
- Seek.
- Skip to next song.
- Force sync all users to the current room time.
- Reorder the playlist.
- Remove any song from the playlist.
- Transfer room ownership.
- Delete the room.

Members cannot:

- Seek the room player.
- Skip songs.
- Reorder the playlist.
- Force other users to sync to their time.
- Change the shared room playback state.

Members can:

- Listen to the room music.
- Add songs to the queue if the room allows it.
- Adjust their own volume locally.
- Request sync from the server if their player is out of sync.

---

### 2.4 Time Synchronization

All members in a room must sync to the current playback time of the room owner.

The server stores the canonical room player state:

```ts
type RoomPlayerState = {
  roomId: number;
  currentVideoId: string | null;
  currentQueueItemId: number | null;
  status: 'idle' | 'playing' | 'paused';
  currentTime: number;
  startedAt: string | null;
  updatedBy: number;
};
```

When the room is playing, the real current time is calculated as:

```ts
const realCurrentTime =
  roomState.currentTime +
  (Date.now() - new Date(roomState.startedAt).getTime()) / 1000;
```

When a user joins a room:

```txt
User joins room
→ Server sends current room player state
→ Client loads current videoId
→ Client seeks to realCurrentTime
→ Client plays or pauses based on room state
```

If a member becomes out of sync:

```txt
Member requests sync
→ Server calculates realCurrentTime
→ Server returns current video and time
→ Member player seeks to the correct time
```

Members are allowed to request sync, but they are not allowed to update the shared room state.

---

### 2.5 No Seeking for Members

Members cannot seek the room playback timeline.

Frontend should disable or hide seek controls for members in room mode.

Backend must also reject seek events from non-owner users.

Example rule:

```txt
If user.role !== 'owner':
  reject room:player:seek
```

The owner can seek, and all users will sync to the new time.

---

### 2.6 Volume Is Local Only

Volume is not synchronized in the room.

Each user controls their own volume.

Volume should be stored locally on the client:

```ts
localStorage.setItem('music-room-volume', String(volume));
```

Volume should not be stored in room state.

Volume should not be broadcast through Socket.IO.

---

### 2.7 Room Queue / Playlist

Songs added to a room are stored in the room playlist / queue.

Basic flow:

```txt
User searches song
→ User adds song to room queue
→ Song is added to the end of the playlist
→ Server broadcasts queue update to all room members
```

Only the owner can reorder the playlist.

Members can add songs if `allow_member_add_song = true`.

Members cannot reorder queue items.

Queue item lifecycle:

```txt
queued → playing → played
queued → removed
playing → played
```

Queue item statuses:

- `queued`: waiting to be played.
- `playing`: currently playing.
- `played`: already played.
- `removed`: removed from queue.

---

### 2.8 Auto Play Next Song

When the current song ends, the room should automatically continue to the next song in the playlist.

Flow:

```txt
YouTube player emits ended event
→ Owner client sends room:player:ended
→ Server validates owner
→ Server marks current queue item as played
→ Server finds next queued song by position
→ Server marks next item as playing
→ Server updates room player state
→ Server broadcasts room:player:next
→ All clients load and play the next video
```

If there is no next song:

```txt
Queue is empty
→ Server sets room status to idle
→ Server clears current video state
→ Clients show empty queue state
```

Important:

- The server decides the next song.
- The client should not decide the next song independently.
- Only the owner client should send the ended event.
- Backend should reject ended events from members.

---

### 2.9 Owner Leaves Room

When the owner leaves the room, the owner still keeps room ownership.

Rules:

```txt
Owner leaves room
→ Room still exists
→ owner_id does not change
→ Queue remains unchanged
→ Player state remains unchanged
→ Members can stay in the room
```

If the owner is offline:

- Members can continue listening if the current player state is already available.
- Members cannot control playback.
- Members cannot reorder queue.
- The room waits until the owner comes back or transfers ownership.

---

### 2.10 Transfer Room Ownership

The owner can assign ownership to another user in the room.

Flow:

```txt
Owner selects a member
→ Owner assigns that member as new owner
→ Server validates current owner
→ Server updates rooms.owner_id
→ Server updates room_members roles
→ Server broadcasts room:owner:changed
```

After ownership transfer:

- New owner has all owner permissions.
- Previous owner becomes a member unless another role is introduced later.

---

## 3. Recommended Tech Stack

### 3.1 Frontend

Recommended frontend stack:

```txt
Next.js
TypeScript
Tailwind CSS
shadcn/ui
Framer Motion
Zustand
Socket.IO Client
YouTube IFrame Player API
design-taste-frontend skill
```

Install the design skill:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

Frontend style direction:

- Dark mode first.
- Modern music app feeling.
- Glassmorphism cards.
- Gradient background.
- Smooth transitions.
- Clean spacing.
- Responsive mobile-first layout.
- Sticky mini player.
- Search-focused experience.
- Room queue with drag-and-drop for owner only.

---

### 3.2 Backend

Recommended backend stack:

```txt
NestJS
TypeScript
Prisma
MySQL
Socket.IO
JWT Authentication
Redis optional
```

Why NestJS:

- Good structure for medium-size applications.
- Clear modules, services, controllers, guards, gateways.
- Good fit for REST API and WebSocket in the same app.
- Easier to maintain than raw Express when the app grows.

Backend modules:

```txt
src/
├── auth/
├── users/
├── youtube/
├── rooms/
├── queue/
├── player-sync/
├── websocket/
├── common/
└── prisma/
```

---

### 3.3 Database

Recommended database:

```txt
MySQL
```

Why MySQL:

- Easy to set up.
- Easy to deploy.
- Good fit for users, rooms, queue, history, and favorites.
- Works well with Prisma.
- Enough for MVP and early production.

Redis can be added later for:

- YouTube search cache.
- Room state cache.
- Socket scaling.
- Rate limiting.

---

## 4. Architecture Overview

```txt
Frontend - Next.js
        |
        | REST API
        v
Backend - NestJS
        |
        | Prisma ORM
        v
MySQL Database

Frontend - Socket.IO Client
        |
        | WebSocket
        v
Backend - Socket.IO Gateway

Backend
        |
        | YouTube Data API v3
        v
YouTube API

Frontend
        |
        | YouTube IFrame Player API
        v
YouTube Embedded Player
```

---

## 5. YouTube Integration

### 5.1 YouTube Data API v3

Used for:

- Searching videos.
- Getting video title.
- Getting thumbnail.
- Getting channel title.
- Getting duration.
- Checking embeddable status.

Frontend should not call YouTube API directly.

Backend should act as a proxy to protect the API key.

Internal API examples:

```txt
GET /youtube/search?q=lofi
GET /youtube/videos/:videoId
```

---

### 5.2 YouTube IFrame Player API

Used for:

- Loading YouTube video by `videoId`.
- Play.
- Pause.
- Seek.
- Detect ended state.
- Get current time.
- Get player state.

The app should not download YouTube audio or video.

The app should not stream YouTube audio from the backend.

Playback should happen through the official YouTube embedded player.

---

## 6. Frontend Pages

### 6.1 Home Page

Route:

```txt
/
```

Purpose:

- Public listening page.
- No login required.

Sections:

- Hero section.
- Search bar.
- Personal player.
- Personal queue.
- Recently played.
- Login call-to-action.
- Create room call-to-action.

---

### 6.2 Auth Pages

Routes:

```txt
/login
/register
```

Purpose:

- User login.
- User registration.
- Optional Google login later.

---

### 6.3 Room Page

Route:

```txt
/room/:code
```

Purpose:

- Synchronized room listening.
- Login required.

Sections:

- Room header.
- Owner indicator.
- Member list.
- Main player.
- Room queue.
- Search and add song.
- Queue reorder UI for owner only.
- Invite link.
- Sync status indicator.

Owner UI:

- Play button.
- Pause button.
- Seek control.
- Next button.
- Force sync button.
- Drag-and-drop queue reorder.
- Transfer ownership.

Member UI:

- Read-only player timeline.
- Local volume control.
- Add song button if allowed.
- Sync to owner button.
- No seek control.
- No reorder control.

---

### 6.4 Profile Page

Route:

```txt
/me
```

Purpose:

- Show profile info.
- Show listening history.
- Show favorite songs.

---

## 7. API Design

### 7.1 Auth API

```txt
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
GET    /auth/me
```

---

### 7.2 YouTube API

```txt
GET    /youtube/search?q={keyword}
GET    /youtube/videos/:videoId
```

---

### 7.3 Room API

```txt
POST   /rooms
GET    /rooms/:code
PATCH  /rooms/:code
DELETE /rooms/:code

POST   /rooms/:code/join
POST   /rooms/:code/leave
GET    /rooms/:code/members
POST   /rooms/:code/owner/assign
```

---

### 7.4 Queue API

```txt
GET    /rooms/:code/queue
POST   /rooms/:code/queue
DELETE /rooms/:code/queue/:queueId
PATCH  /rooms/:code/queue/reorder
POST   /rooms/:code/queue/next
```

---

### 7.5 Player API

```txt
GET    /rooms/:code/player-state
POST   /rooms/:code/player/play
POST   /rooms/:code/player/pause
POST   /rooms/:code/player/seek
POST   /rooms/:code/player/sync
POST   /rooms/:code/player/force-sync
POST   /rooms/:code/player/ended
```

Rules:

- `play`: owner only.
- `pause`: owner only.
- `seek`: owner only.
- `force-sync`: owner only.
- `ended`: owner only.
- `sync`: any room member can request sync for themselves.

---

### 7.6 Personal API

```txt
GET    /me/history
POST   /me/history
DELETE /me/history

GET    /me/favorites
POST   /me/favorites
DELETE /me/favorites/:videoId
```

---

## 8. Socket Events

### 8.1 Room Events

```txt
room:join
room:leave
room:member:update
room:owner:assign
room:owner:changed
```

---

### 8.2 Queue Events

```txt
room:queue:add
room:queue:remove
room:queue:reorder
room:queue:update
```

Rules:

- Add queue item: member allowed if room setting allows.
- Reorder queue: owner only.
- Remove any song: owner only.
- Remove own song: optional based on room setting.

---

### 8.3 Player Events

```txt
room:player:play
room:player:pause
room:player:seek
room:player:next
room:player:ended
room:player:sync
room:player:force-sync
room:player:state
```

Rules:

- Play: owner only.
- Pause: owner only.
- Seek: owner only.
- Next: owner only.
- Ended: owner only.
- Sync request: member allowed.
- Force sync: owner only.

---

## 9. Database Design

### 9.1 users

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255),
  avatar_url TEXT,
  provider ENUM('local', 'google') DEFAULT 'local',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

### 9.2 rooms

```sql
CREATE TABLE rooms (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  owner_id BIGINT NOT NULL,
  is_private BOOLEAN DEFAULT FALSE,

  current_video_id VARCHAR(50),
  current_queue_item_id BIGINT NULL,
  current_time DOUBLE DEFAULT 0,
  player_status ENUM('idle', 'playing', 'paused') DEFAULT 'idle',
  started_at DATETIME NULL,

  allow_member_add_song BOOLEAN DEFAULT TRUE,
  allow_member_remove_own_song BOOLEAN DEFAULT FALSE,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

---

### 9.3 room_members

```sql
CREATE TABLE room_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role ENUM('owner', 'member') DEFAULT 'member',
  is_online BOOLEAN DEFAULT FALSE,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,

  UNIQUE KEY unique_room_user (room_id, user_id),

  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

### 9.4 room_queue

```sql
CREATE TABLE room_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  room_id BIGINT NOT NULL,
  video_id VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  channel_title VARCHAR(255),
  thumbnail_url TEXT,
  duration_seconds INT,
  added_by BIGINT NOT NULL,
  position INT NOT NULL,
  status ENUM('queued', 'playing', 'played', 'removed') DEFAULT 'queued',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (added_by) REFERENCES users(id)
);
```

Recommended indexes:

```sql
CREATE INDEX idx_room_queue_room_position ON room_queue(room_id, position);
CREATE INDEX idx_room_queue_room_status ON room_queue(room_id, status);
```

---

### 9.5 personal_history

```sql
CREATE TABLE personal_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  video_id VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  channel_title VARCHAR(255),
  thumbnail_url TEXT,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

### 9.6 favorites

```sql
CREATE TABLE favorites (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  video_id VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  channel_title VARCHAR(255),
  thumbnail_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_user_video (user_id, video_id),

  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

### 9.7 youtube_video_cache

This table is optional but recommended to reduce YouTube API quota usage.

```sql
CREATE TABLE youtube_video_cache (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  video_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  channel_title VARCHAR(255),
  thumbnail_url TEXT,
  duration_seconds INT,
  embeddable BOOLEAN DEFAULT TRUE,
  raw_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

### 9.8 youtube_search_cache

This table is optional if Redis is not used.

```sql
CREATE TABLE youtube_search_cache (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  query_hash VARCHAR(64) UNIQUE NOT NULL,
  query_text VARCHAR(500) NOT NULL,
  result_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10. Permission Matrix

| Action | Guest | Member | Owner |
|---|---:|---:|---:|
| Search YouTube | Yes | Yes | Yes |
| Personal listening | Yes | Yes | Yes |
| Create room | No | Yes | Yes |
| Join room | No | Yes | Yes |
| Add song to room queue | No | Yes, if allowed | Yes |
| Reorder room queue | No | No | Yes |
| Remove own song | No | Optional | Yes |
| Remove any song | No | No | Yes |
| Play / pause room player | No | No | Yes |
| Seek room player | No | No | Yes |
| Skip song | No | No | Yes |
| Request sync | No | Yes | Yes |
| Force sync all users | No | No | Yes |
| Change local volume | Yes | Yes | Yes |
| Transfer ownership | No | No | Yes |
| Delete room | No | No | Yes |

---

## 11. Player State Handling

### 11.1 Play

Owner starts playback.

```txt
Owner clicks play
→ Client emits room:player:play
→ Server validates owner
→ Server updates player_status = playing
→ Server updates current_time
→ Server updates started_at = now
→ Server broadcasts room:player:state
```

---

### 11.2 Pause

Owner pauses playback.

```txt
Owner clicks pause
→ Client sends currentTime
→ Server validates owner
→ Server stores current_time
→ Server sets player_status = paused
→ Server clears or freezes started_at
→ Server broadcasts room:player:state
```

---

### 11.3 Seek

Owner seeks to another timestamp.

```txt
Owner seeks
→ Client sends new currentTime
→ Server validates owner
→ Server updates current_time
→ Server updates started_at = now if playing
→ Server broadcasts room:player:seek
→ Members seek to the new time
```

---

### 11.4 Sync

Member requests sync.

```txt
Member clicks sync
→ Client emits room:player:sync
→ Server calculates realCurrentTime
→ Server sends state only to that member
→ Member player seeks to realCurrentTime
```

---

### 11.5 Force Sync

Owner forces all users to sync.

```txt
Owner clicks force sync
→ Server validates owner
→ Server calculates realCurrentTime
→ Server broadcasts room:player:force-sync
→ All members seek to realCurrentTime
```

---

## 12. Queue Handling

### 12.1 Add Song

```txt
User adds song
→ Server validates room membership
→ Server checks allow_member_add_song
→ Server gets video metadata
→ Server inserts song at max(position) + 1
→ Server broadcasts queue update
```

---

### 12.2 Reorder Queue

Only owner can reorder the queue.

```txt
Owner drags queue item
→ Client sends new order
→ Server validates owner
→ Server updates queue positions in transaction
→ Server broadcasts queue update
```

Important:

- Use DB transaction.
- Validate all queue item IDs belong to the room.
- Do not allow reordering removed or played items unless explicitly supported.

---

### 12.3 Remove Song

```txt
Owner removes song
→ Server marks queue item as removed
→ Server broadcasts queue update
```

If a member removes their own song:

```txt
Member removes own song
→ Server checks allow_member_remove_own_song
→ Server checks added_by = current user
→ Server marks queue item as removed
```

---

### 12.4 Next Song

Only owner can manually skip to next song.

```txt
Owner clicks next
→ Server marks current item as played
→ Server finds next queued item
→ Server marks next item as playing
→ Server updates room player state
→ Server broadcasts room:player:next
```

---

## 13. Important Validation Rules

Backend must validate every important room action.

Never rely only on frontend hiding buttons.

Validation examples:

```txt
room:player:seek
→ user must be owner

room:queue:reorder
→ user must be owner

room:owner:assign
→ user must be current owner
→ target user must be a room member

room:queue:add
→ user must be a room member
→ room must allow member add song if user is not owner
```

---

## 14. Environment Variables

### 14.1 Frontend

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

---

### 14.2 Backend

```env
PORT=3001

DATABASE_URL="mysql://user:password@localhost:3306/music_room"

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

YOUTUBE_API_KEY=your_youtube_api_key

REDIS_URL=redis://localhost:6379
```

---

## 15. Local Development

### 15.1 Clone Project

```bash
git clone <repo-url>
cd music-room
```

---

### 15.2 Setup Frontend

```bash
cd frontend
npm install

npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"

npm run dev
```

---

### 15.3 Setup Backend

```bash
cd backend
npm install
npm run start:dev
```

---

### 15.4 Setup MySQL with Docker

```bash
docker run --name music-room-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=music_room \
  -p 3306:3306 \
  -d mysql:8
```

---

### 15.5 Run Prisma Migration

```bash
cd backend
npx prisma migrate dev
```

---

## 16. Suggested Folder Structure

### 16.1 Frontend

```txt
frontend/
├── app/
│   ├── page.tsx
│   ├── login/
│   ├── register/
│   ├── room/
│   │   └── [code]/
│   └── me/
├── components/
│   ├── player/
│   ├── room/
│   ├── queue/
│   ├── search/
│   └── ui/
├── hooks/
├── stores/
├── services/
├── types/
└── lib/
```

---

### 16.2 Backend

```txt
backend/
├── src/
│   ├── auth/
│   ├── users/
│   ├── youtube/
│   ├── rooms/
│   ├── queue/
│   ├── websocket/
│   ├── player-sync/
│   ├── prisma/
│   ├── common/
│   └── main.ts
├── prisma/
│   └── schema.prisma
└── package.json
```

---

## 17. MVP Roadmap

### Phase 1: Personal Listening

- Home page.
- YouTube search.
- YouTube player.
- Local personal queue.
- Recently played using localStorage.

---

### Phase 2: Authentication

- Register.
- Login.
- JWT auth.
- Save history.
- Save favorites.

---

### Phase 3: Room Basic

- Create room.
- Join room by code.
- Room member list.
- Add song to queue.
- Queue update through Socket.IO.

---

### Phase 4: Owner-Controlled Playback

- Owner play.
- Owner pause.
- Owner seek.
- Owner next song.
- Member read-only playback.
- Member sync to room time.

---

### Phase 5: Playlist Management

- Owner reorder queue.
- Owner remove songs.
- Auto play next song.
- Queue lifecycle handling.

---

### Phase 6: Ownership Management

- Owner leaves room but keeps ownership.
- Owner transfers ownership to another member.
- Broadcast owner change.

---

### Phase 7: UI Polish

- Apply `design-taste-frontend` style.
- Smooth animations.
- Responsive mobile layout.
- Better empty states.
- Better loading states.
- Better error handling.

---

### Phase 8: Optimization

- Cache YouTube search results.
- Add Redis.
- Add API rate limit.
- Optimize socket events.
- Add room cleanup job.

---

## 18. Error Handling

Recommended common errors:

```txt
AUTH_REQUIRED
ROOM_NOT_FOUND
ROOM_ACCESS_DENIED
USER_NOT_ROOM_MEMBER
ONLY_OWNER_CAN_CONTROL_PLAYER
ONLY_OWNER_CAN_REORDER_QUEUE
ONLY_OWNER_CAN_TRANSFER_OWNERSHIP
MEMBER_CANNOT_SEEK
QUEUE_ITEM_NOT_FOUND
NO_NEXT_SONG
YOUTUBE_VIDEO_NOT_EMBEDDABLE
YOUTUBE_API_QUOTA_EXCEEDED
```

Frontend should show friendly messages for each error.

Examples:

```txt
Only the room owner can control playback.
Only the room owner can reorder the playlist.
This YouTube video cannot be played here.
No next song in the queue.
```

---

## 19. Security Notes

- Keep YouTube API key only in backend.
- Do not expose API key to frontend.
- Use HttpOnly cookie for refresh token.
- Validate socket authentication.
- Validate room membership for every room event.
- Validate owner permission for every owner-only action.
- Use rate limit for YouTube search API.
- Do not trust client-side role checks.
- Do not allow users to update room state directly without server validation.

---

## 20. YouTube API Quota Strategy

YouTube search can consume quota quickly.

Recommended strategy:

- Debounce search input on frontend.
- Search only when query length is at least 2 or 3 characters.
- Cache search results.
- Cache video metadata.
- Prefer `videos.list` for metadata after obtaining video IDs.
- Avoid calling YouTube API on every keystroke.

Recommended debounce:

```txt
500ms - 800ms
```

Recommended cache TTL:

```txt
Search result: 6 - 24 hours
Video metadata: 7 - 30 days
```

---

## 21. Final Recommended Stack

```txt
Frontend:
Next.js + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion + Zustand

Design:
design-taste-frontend skill

Backend:
NestJS + TypeScript + Prisma + Socket.IO + JWT

Database:
MySQL

Optional:
Redis for cache and realtime optimization

External API:
YouTube Data API v3
YouTube IFrame Player API
```

---

## 22. Important Implementation Notes

- Server is the source of truth for room state.
- Only owner can update shared playback state.
- Members cannot seek or skip room playback.
- Members can adjust volume locally.
- Queue order can only be changed by owner.
- Songs automatically move to the next item when the current one ends.
- Owner leaving the room does not remove ownership.
- Owner can transfer ownership to another room member.
- Backend must validate permissions for all socket and REST actions.
- Client should request sync if it detects drift from the room state.
- The app should use YouTube official embed player for playback.
- Do not download, extract, or restream YouTube audio/video.
