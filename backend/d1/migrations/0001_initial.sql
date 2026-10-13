-- Initial Cloudflare D1 schema, translated from backend/prisma/schema.prisma.
-- Keep the MySQL Prisma schema and migration history unchanged during the staged cutover.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(email) <= 255),
  username TEXT NOT NULL CHECK (length(username) <= 100),
  password_hash TEXT CHECK (password_hash IS NULL OR length(password_hash) <= 255),
  avatar_url TEXT,
  provider TEXT NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'google')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(code) <= 20),
  name TEXT NOT NULL CHECK (length(name) <= 255),
  owner_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  current_video_id TEXT CHECK (current_video_id IS NULL OR length(current_video_id) <= 50),
  current_queue_item_id INTEGER REFERENCES room_queue(id) ON UPDATE CASCADE ON DELETE SET NULL,
  current_time REAL NOT NULL DEFAULT 0,
  player_status TEXT NOT NULL DEFAULT 'idle' CHECK (player_status IN ('idle', 'playing', 'paused')),
  started_at TEXT,
  allow_member_add_song INTEGER NOT NULL DEFAULT 1 CHECK (allow_member_add_song IN (0, 1)),
  allow_member_remove_own_song INTEGER NOT NULL DEFAULT 0 CHECK (allow_member_remove_own_song IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE room_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  is_online INTEGER NOT NULL DEFAULT 0 CHECK (is_online IN (0, 1)),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  CONSTRAINT unique_room_user UNIQUE (room_id, user_id)
);

CREATE TABLE room_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  video_id TEXT NOT NULL CHECK (length(video_id) <= 50),
  title TEXT NOT NULL CHECK (length(title) <= 500),
  channel_title TEXT CHECK (channel_title IS NULL OR length(channel_title) <= 255),
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  added_by INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'playing', 'played', 'removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE personal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  video_id TEXT NOT NULL CHECK (length(video_id) <= 50),
  title TEXT NOT NULL CHECK (length(title) <= 500),
  channel_title TEXT CHECK (channel_title IS NULL OR length(channel_title) <= 255),
  thumbnail_url TEXT,
  played_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  video_id TEXT NOT NULL CHECK (length(video_id) <= 50),
  title TEXT NOT NULL CHECK (length(title) <= 500),
  channel_title TEXT CHECK (channel_title IS NULL OR length(channel_title) <= 255),
  thumbnail_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT unique_user_video UNIQUE (user_id, video_id)
);

CREATE TABLE youtube_video_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL UNIQUE CHECK (length(video_id) <= 50),
  title TEXT NOT NULL CHECK (length(title) <= 500),
  channel_title TEXT CHECK (channel_title IS NULL OR length(channel_title) <= 255),
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  embeddable INTEGER NOT NULL DEFAULT 1 CHECK (embeddable IN (0, 1)),
  raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE youtube_search_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_hash TEXT NOT NULL UNIQUE CHECK (length(query_hash) <= 64),
  query_text TEXT NOT NULL CHECK (length(query_text) <= 500),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_room_queue_room_position ON room_queue(room_id, position);
CREATE INDEX idx_room_queue_room_status ON room_queue(room_id, status);
