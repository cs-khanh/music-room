const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
// Workers Web Crypto currently caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;

const json = (body, status = 200, headers = {}) => {
  const responseHeaders = new Headers({
    "content-type": "application/json; charset=utf-8",
  });
  for (const [name, value] of Object.entries(headers)) {
    for (const item of Array.isArray(value) ? value : [value])
      responseHeaders.append(name, item);
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
};

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64url = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0),
  );
};

const encodeJson = (value) =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

async function signToken(payload, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson({ ...payload, iat: now, exp: now + ttlSeconds });
  const message = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return `${message}.${base64url(signature)}`;
}

async function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3 || !secret) return null;
  try {
    const header = JSON.parse(
      new TextDecoder().decode(fromBase64url(parts[0])),
    );
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64url(parts[1])),
    );
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${base64url(salt)}$${base64url(bits)}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, iterationText, saltText, hashText] = (encoded ?? "").split(
    "$",
  );
  if (algorithm !== "pbkdf2-sha256" || !saltText || !hashText) return false;
  const iterations = Number(iterationText);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 500_000
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64url(saltText),
      iterations,
    },
    key,
    256,
  );
  const actual = new Uint8Array(bits);
  const expected = fromBase64url(hashText);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1)
    difference |= actual[index] ^ expected[index];
  return difference === 0;
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((part) => {
        const index = part.indexOf("=");
        return index < 0
          ? ["", ""]
          : [
              part.slice(0, index).trim(),
              decodeURIComponent(part.slice(index + 1).trim()),
            ];
      })
      .filter(([key]) => key),
  );
}

function cookie(name, value, request, maxAge) {
  const secure = new URL(request.url).protocol === "https:";
  const sameSite = secure ? "None" : "Lax";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function authCookies(request, accessToken, refreshToken) {
  return [
    cookie("access_token", accessToken, request, ACCESS_TTL_SECONDS),
    cookie("refresh_token", refreshToken, request, REFRESH_TTL_SECONDS),
  ];
}

function publicUser(row) {
  return {
    id: Number(row.id),
    email: row.email,
    username: row.username,
    avatarUrl: row.avatar_url ?? null,
  };
}

async function authResponse(user, env) {
  const claims = {
    sub: Number(user.id),
    email: user.email,
    username: user.username,
  };
  const [accessToken, refreshToken] = await Promise.all([
    signToken(claims, env.JWT_SECRET, ACCESS_TTL_SECONDS),
    signToken(claims, env.JWT_REFRESH_SECRET, REFRESH_TTL_SECONDS),
  ]);
  return { accessToken, refreshToken, user: publicUser(user) };
}

async function bodyJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body
      : null;
  } catch {
    return null;
  }
}

async function register(request, env) {
  const body = await bodyJson(request);
  requireKeys(body, ["email", "username", "password"]);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const password = body?.password;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 255 ||
    username.length < 2 ||
    username.length > 100 ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    return json({ message: "Email, username, or password is invalid." }, 400);
  }

  const passwordHash = await hashPassword(password);
  try {
    const result = await env.DB.prepare(
      "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?) RETURNING id, email, username, avatar_url",
    )
      .bind(email, username, passwordHash)
      .first();
    const resultAuth = await authResponse(result, env);
    return json(
      { accessToken: resultAuth.accessToken, user: resultAuth.user },
      201,
      {
        "set-cookie": authCookies(
          request,
          resultAuth.accessToken,
          resultAuth.refreshToken,
        ),
      },
    );
  } catch (error) {
    if (String(error).toLowerCase().includes("unique"))
      return json({ message: "Email is already registered." }, 409);
    throw error;
  }
}

async function login(request, env) {
  const body = await bodyJson(request);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body?.password;
  requireKeys(body, ["email", "password"]);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 255 ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    fail(400, "Email or password is invalid.");
  const user = await env.DB.prepare(
    "SELECT id, email, username, avatar_url, password_hash FROM users WHERE email = ? COLLATE NOCASE",
  )
    .bind(email)
    .first();
  if (
    !user?.password_hash ||
    !(await verifyPassword(password, user.password_hash))
  )
    return json({ message: "Invalid email or password." }, 401);
  const result = await authResponse(user, env);
  return json({ accessToken: result.accessToken, user: result.user }, 201, {
    "set-cookie": authCookies(request, result.accessToken, result.refreshToken),
  });
}

async function authenticatedUser(request, env) {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : parseCookies(request).access_token;
  if (!token) return null;
  const claims = await verifyToken(token, env.JWT_SECRET);
  if (!claims?.sub) return null;
  return env.DB.prepare(
    "SELECT id, email, username, avatar_url FROM users WHERE id = ?",
  )
    .bind(claims.sub)
    .first();
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function requireKeys(body, allowed) {
  if (!body || Object.keys(body).some((key) => !allowed.includes(key)))
    fail(400, "Request body is invalid.");
}

function isBoolean(value) {
  return typeof value === "boolean";
}
function isInteger(value, min = 0) {
  return Number.isSafeInteger(value) && value >= min;
}
function isoNow() {
  return new Date().toISOString();
}
function publicQueueItem(row) {
  return {
    id: Number(row.id),
    roomId: Number(row.room_id),
    videoId: row.video_id,
    title: row.title,
    channelTitle: row.channel_title,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: row.duration_seconds,
    addedBy: Number(row.added_by),
    position: Number(row.position),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRoom(env, code) {
  const room = await env.DB.prepare(
    "SELECT * FROM rooms WHERE code = ? COLLATE NOCASE",
  )
    .bind(code)
    .first();
  if (!room) fail(404, "Room not found.");
  return room;
}

async function requireMember(env, code, userId) {
  const row = await env.DB.prepare(
    "SELECT m.* FROM room_members m JOIN rooms r ON r.id = m.room_id WHERE r.code = ? COLLATE NOCASE AND m.user_id = ?",
  )
    .bind(code, userId)
    .first();
  if (!row) fail(403, "User is not a room member.");
  return row;
}

async function requireOwner(env, code, userId) {
  const room = await getRoom(env, code);
  const member = await env.DB.prepare(
    "SELECT id FROM room_members WHERE room_id = ? AND user_id = ? AND role = 'owner'",
  )
    .bind(room.id, userId)
    .first();
  if (!member) fail(403, "Only the room owner can perform this action.");
  return room;
}

async function requireRootOwner(env, code, userId) {
  const room = await getRoom(env, code);
  if (Number(room.owner_id) !== Number(userId))
    fail(403, "Only the root room owner can perform this action.");
  return room;
}

async function getQueue(env, roomId, status = "queued") {
  const rows = await env.DB.prepare(
    "SELECT * FROM room_queue WHERE room_id = ? AND status = ? ORDER BY position ASC",
  )
    .bind(roomId, status)
    .all();
  return (rows.results ?? []).map(publicQueueItem);
}

async function serializePlayer(env, room) {
  let currentQueueItem = null;
  if (room.current_queue_item_id != null) {
    const item = await env.DB.prepare("SELECT * FROM room_queue WHERE id = ?")
      .bind(room.current_queue_item_id)
      .first();
    if (item) currentQueueItem = publicQueueItem(item);
  }
  const startedAt = room.started_at;
  const currentTime =
    room.player_status === "playing" && startedAt
      ? Number(room.current_time) +
        Math.max(0, (Date.now() - Date.parse(startedAt)) / 1000)
      : Number(room.current_time);
  return {
    roomId: Number(room.id),
    currentVideoId: room.current_video_id,
    currentQueueItemId:
      room.current_queue_item_id == null
        ? null
        : Number(room.current_queue_item_id),
    currentQueueItem,
    status: room.player_status,
    currentTime,
    startedAt,
    updatedBy: Number(room.owner_id),
  };
}

async function roomPayload(env, room) {
  const [currentQueueItem, membersResult, queue] = await Promise.all([
    room.current_queue_item_id == null
      ? Promise.resolve(null)
      : env.DB.prepare("SELECT * FROM room_queue WHERE id = ?")
          .bind(room.current_queue_item_id)
          .first(),
    env.DB.prepare(
      `SELECT m.*, u.username, u.avatar_url FROM room_members m JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ? ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END, m.joined_at ASC`,
    )
      .bind(room.id)
      .all(),
    getQueue(env, room.id),
  ]);
  const members = (membersResult.results ?? []).map((member) => ({
    id: Number(member.id),
    roomId: Number(member.room_id),
    userId: Number(member.user_id),
    username: member.username,
    avatarUrl: member.avatar_url,
    role: member.role,
    isOnline: Boolean(member.is_online),
    joinedAt: member.joined_at,
    lastSeenAt: member.last_seen_at,
  }));
  const player = await serializePlayer(env, {
    ...room,
    current_queue_item_id: room.current_queue_item_id,
  });
  if (currentQueueItem)
    player.currentQueueItem = publicQueueItem(currentQueueItem);
  return {
    id: Number(room.id),
    code: room.code,
    name: room.name,
    ownerId: Number(room.owner_id),
    isPrivate: Boolean(room.is_private),
    allowMemberAddSong: Boolean(room.allow_member_add_song),
    allowMemberRemoveOwnSong: Boolean(room.allow_member_remove_own_song),
    playerState: player,
    members,
    queue,
  };
}

async function roomSnapshot(env, code, userId) {
  await requireMember(env, code, userId);
  return roomPayload(env, await getRoom(env, code));
}

async function youtubeVideo(env, videoId) {
  if (typeof videoId !== "string" || videoId.length < 3 || videoId.length > 50)
    fail(400, "videoId is invalid.");
  const [video] = await getYoutubeVideos(env, [videoId]);
  if (!video) fail(400, "YouTube video was not found.");
  return video;
}

async function getYoutubeVideos(env, inputIds) {
  const ids = [...new Set(inputIds)];
  if (!ids.length) return [];
  if (
    ids.some((id) => typeof id !== "string" || id.length < 3 || id.length > 50)
  )
    fail(400, "videoId is invalid.");
  const placeholders = ids.map(() => "?").join(",");
  const cachedRows = await env.DB.prepare(
    `SELECT * FROM youtube_video_cache WHERE video_id IN (${placeholders})`,
  )
    .bind(...ids)
    .all();
  const byId = new Map(
    (cachedRows.results ?? []).map((row) => [
      row.video_id,
      {
        videoId: row.video_id,
        title: row.title,
        channelTitle: row.channel_title ?? "",
        thumbnailUrl: row.thumbnail_url ?? "",
        durationSeconds: row.duration_seconds,
        embeddable: Boolean(row.embeddable),
      },
    ]),
  );
  const missing = ids.filter((id) => !byId.has(id));
  if (!missing.length)
    return inputIds.map((id) => byId.get(id)).filter(Boolean);
  const key = env.YOUTUBE_API_KEY;
  if (
    !key ||
    key === "change-me" ||
    key === "paste-your-youtube-data-api-v3-key-here"
  )
    fail(503, "YOUTUBE_API_KEY is not configured.");
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails,status");
  url.searchParams.set("id", missing.join(","));
  url.searchParams.set("key", key);
  const response = await fetch(url);
  if (!response.ok) fail(503, `YouTube API request failed: ${response.status}`);
  const data = await response.json();
  const now = isoNow();
  const statements = [];
  for (const item of data.items ?? []) {
    const thumbnails = item.snippet.thumbnails ?? {};
    const thumbnailUrl =
      thumbnails.maxres?.url ??
      thumbnails.high?.url ??
      thumbnails.medium?.url ??
      thumbnails.default?.url ??
      "";
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(
      item.contentDetails.duration ?? "",
    );
    const durationSeconds = match
      ? Number(match[1] ?? 0) * 3600 +
        Number(match[2] ?? 0) * 60 +
        Number(match[3] ?? 0)
      : null;
    const video = {
      videoId: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl,
      durationSeconds,
      embeddable: Boolean(item.status.embeddable),
    };
    byId.set(video.videoId, video);
    statements.push(
      env.DB.prepare(
        `INSERT INTO youtube_video_cache (video_id,title,channel_title,thumbnail_url,duration_seconds,embeddable,raw_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET title=excluded.title,channel_title=excluded.channel_title,thumbnail_url=excluded.thumbnail_url,
      duration_seconds=excluded.duration_seconds,embeddable=excluded.embeddable,raw_json=excluded.raw_json,updated_at=excluded.updated_at`,
      ).bind(
        video.videoId,
        video.title,
        video.channelTitle,
        video.thumbnailUrl,
        durationSeconds,
        video.embeddable ? 1 : 0,
        JSON.stringify(item),
        now,
        now,
      ),
    );
  }
  if (statements.length) await env.DB.batch(statements);
  return inputIds.map((id) => byId.get(id)).filter(Boolean);
}

async function nextTrack(env, room) {
  const now = isoNow();
  // D1 batches execute atomically and in order. Selection occurs inside the batch,
  // so concurrent end/next requests cannot promote the same item twice.
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE room_queue SET status='played',updated_at=? WHERE room_id=? AND status='playing'`,
    ).bind(now, room.id),
    env.DB.prepare(
      `UPDATE room_queue SET status='playing',updated_at=? WHERE id=(SELECT id FROM room_queue WHERE room_id=? AND status='queued' ORDER BY position ASC LIMIT 1)`,
    ).bind(now, room.id),
    env.DB.prepare(
      `UPDATE rooms SET current_queue_item_id=(SELECT id FROM room_queue WHERE room_id=? AND status='playing' ORDER BY updated_at DESC,id DESC LIMIT 1),
      current_video_id=(SELECT video_id FROM room_queue WHERE room_id=? AND status='playing' ORDER BY updated_at DESC,id DESC LIMIT 1),
      current_time=0,player_status=CASE WHEN EXISTS(SELECT 1 FROM room_queue WHERE room_id=? AND status='playing') THEN 'playing' ELSE 'idle' END,
      started_at=CASE WHEN EXISTS(SELECT 1 FROM room_queue WHERE room_id=? AND status='playing') THEN ? ELSE NULL END,updated_at=? WHERE id=?`,
    ).bind(room.id, room.id, room.id, room.id, now, now, room.id),
  ]);
  const updatedRoom = await getRoom(env, room.code);
  return {
    state: await serializePlayer(env, updatedRoom),
    queue: await getQueue(env, room.id),
  };
}

async function handle(request, env, trustedUser = null) {
  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/auth/") &&
    (!env.JWT_SECRET ||
      !env.JWT_REFRESH_SECRET ||
      new TextEncoder().encode(env.JWT_SECRET).length < 32 ||
      new TextEncoder().encode(env.JWT_REFRESH_SECRET).length < 32)
  ) {
    return json({ message: "Authentication secrets are not configured." }, 503);
  }
  if (request.method === "GET" && url.pathname === "/health") {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: row?.ok === 1, database: "d1" });
  }
  if (request.method === "POST" && url.pathname === "/auth/register")
    return register(request, env);
  if (request.method === "POST" && url.pathname === "/auth/login")
    return login(request, env);
  if (request.method === "POST" && url.pathname === "/auth/logout") {
    return json({ ok: true }, 201, {
      "set-cookie": [
        cookie("access_token", "", request, 0),
        cookie("refresh_token", "", request, 0),
      ],
    });
  }
  if (request.method === "POST" && url.pathname === "/auth/refresh") {
    const token = parseCookies(request).refresh_token;
    const claims = token
      ? await verifyToken(token, env.JWT_REFRESH_SECRET)
      : null;
    const user = claims?.sub
      ? await env.DB.prepare(
          "SELECT id, email, username, avatar_url FROM users WHERE id = ?",
        )
          .bind(claims.sub)
          .first()
      : null;
    if (!user)
      return json({ message: "Invalid or expired refresh token." }, 401);
    const result = await authResponse(user, env);
    return json({ accessToken: result.accessToken, user: result.user }, 201, {
      "set-cookie": authCookies(
        request,
        result.accessToken,
        result.refreshToken,
      ),
    });
  }
  if (request.method === "GET" && url.pathname === "/auth/me") {
    const user = trustedUser ?? (await authenticatedUser(request, env));
    return user
      ? json(publicUser(user))
      : json({ message: "Unauthorized." }, 401);
  }

  if (url.pathname.startsWith("/auth/")) {
    const user = trustedUser ?? (await authenticatedUser(request, env));
    if (!user) return json({ message: "Unauthorized." }, 401);
    if (request.method === "POST" && url.pathname === "/auth/change-password") {
      const body = await bodyJson(request);
      requireKeys(body, ["currentPassword", "newPassword"]);
      if (
        typeof body.currentPassword !== "string" ||
        body.currentPassword.length < 8 ||
        body.currentPassword.length > 128 ||
        typeof body.newPassword !== "string" ||
        body.newPassword.length < 8 ||
        body.newPassword.length > 128
      )
        fail(400, "Password is invalid.");
      const row = await env.DB.prepare(
        "SELECT password_hash FROM users WHERE id=?",
      )
        .bind(user.id)
        .first();
      if (!row?.password_hash)
        fail(401, "Password login is not available for this account.");
      if (!(await verifyPassword(body.currentPassword, row.password_hash)))
        fail(401, "Current password is incorrect.");
      if (await verifyPassword(body.newPassword, row.password_hash))
        fail(409, "New password must be different from current password.");
      await env.DB.prepare(
        "UPDATE users SET password_hash=?,updated_at=? WHERE id=?",
      )
        .bind(await hashPassword(body.newPassword), isoNow(), user.id)
        .run();
      return json({ ok: true }, 201);
    }
  }

  const path = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  const method = request.method;
  const body = ["POST", "PATCH", "PUT"].includes(method)
    ? await bodyJson(request)
    : null;
  const publicYoutube = path[0] === "youtube";
  const user = publicYoutube
    ? null
    : (trustedUser ?? (await authenticatedUser(request, env)));
  if (!publicYoutube && !user) return json({ message: "Unauthorized." }, 401);

  if (
    path[0] === "youtube" &&
    method === "GET" &&
    path[1] === "videos" &&
    path[2]
  ) {
    return json(await youtubeVideo(env, path[2]));
  }
  if (path[0] === "youtube" && method === "GET" && path[1] === "search") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 500)
      fail(400, "Search query must be at least 2 characters.");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(query.toLowerCase()),
    );
    const queryHash = [...new Uint8Array(hash)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const cached = await env.DB.prepare(
      "SELECT result_json FROM youtube_search_cache WHERE query_hash=? AND expires_at>?",
    )
      .bind(queryHash, isoNow())
      .first();
    if (cached) return json(JSON.parse(cached.result_json));
    const key = env.YOUTUBE_API_KEY;
    if (
      !key ||
      key === "change-me" ||
      key === "paste-your-youtube-data-api-v3-key-here"
    )
      fail(503, "YOUTUBE_API_KEY is not configured.");
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "8");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("key", key);
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok)
      fail(503, `YouTube API request failed: ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const videos = await getYoutubeVideos(
      env,
      (searchData.items ?? []).map((item) => item.id?.videoId).filter(Boolean),
    );
    const result = { items: videos, nextPageToken: searchData.nextPageToken };
    const now = isoNow();
    await env.DB.prepare(
      `INSERT INTO youtube_search_cache (query_hash,query_text,result_json,expires_at,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(query_hash) DO UPDATE SET query_text=excluded.query_text,result_json=excluded.result_json,expires_at=excluded.expires_at`,
    )
      .bind(
        queryHash,
        query,
        JSON.stringify(result),
        new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        now,
      )
      .run();
    return json(result);
  }

  if (path[0] === "me" && path[1] === "history") {
    if (method === "GET" && path.length === 2) {
      const rows = await env.DB.prepare(
        "SELECT * FROM personal_history WHERE user_id=? ORDER BY played_at DESC LIMIT 50",
      )
        .bind(user.id)
        .all();
      return json(
        (rows.results ?? []).map((r) => ({
          id: Number(r.id),
          userId: Number(r.user_id),
          videoId: r.video_id,
          title: r.title,
          channelTitle: r.channel_title,
          thumbnailUrl: r.thumbnail_url,
          playedAt: r.played_at,
        })),
      );
    }
    if (method === "POST" && path.length === 2) {
      requireKeys(body, ["videoId"]);
      if (
        typeof body?.videoId !== "string" ||
        body.videoId.length < 3 ||
        body.videoId.length > 50
      )
        fail(400, "videoId is invalid.");
      const video = await youtubeVideo(env, body.videoId);
      const now = isoNow();
      const row = await env.DB.prepare(
        "INSERT INTO personal_history (user_id,video_id,title,channel_title,thumbnail_url,played_at) VALUES (?,?,?,?,?,?) RETURNING *",
      )
        .bind(
          user.id,
          video.videoId,
          video.title,
          video.channelTitle,
          video.thumbnailUrl,
          now,
        )
        .first();
      return json(
        {
          id: Number(row.id),
          videoId: row.video_id,
          title: row.title,
          channelTitle: row.channel_title,
          thumbnailUrl: row.thumbnail_url,
          playedAt: row.played_at,
        },
        201,
      );
    }
    if (method === "DELETE" && path.length === 2) {
      await env.DB.prepare("DELETE FROM personal_history WHERE user_id=?")
        .bind(user.id)
        .run();
      return json({ ok: true });
    }
  }
  if (path[0] === "me" && path[1] === "favorites") {
    if (method === "GET" && path.length === 2) {
      const rows = await env.DB.prepare(
        "SELECT * FROM favorites WHERE user_id=? ORDER BY created_at DESC",
      )
        .bind(user.id)
        .all();
      return json(
        (rows.results ?? []).map((r) => ({
          id: Number(r.id),
          userId: Number(r.user_id),
          videoId: r.video_id,
          title: r.title,
          channelTitle: r.channel_title,
          thumbnailUrl: r.thumbnail_url,
          createdAt: r.created_at,
        })),
      );
    }
    if (method === "POST" && path.length === 2) {
      requireKeys(body, ["videoId"]);
      if (
        typeof body?.videoId !== "string" ||
        body.videoId.length < 3 ||
        body.videoId.length > 50
      )
        fail(400, "videoId is invalid.");
      const v = await youtubeVideo(env, body.videoId);
      const now = isoNow();
      const row = await env.DB.prepare(
        `INSERT INTO favorites (user_id,video_id,title,channel_title,thumbnail_url,created_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(user_id,video_id) DO UPDATE SET title=excluded.title,channel_title=excluded.channel_title,thumbnail_url=excluded.thumbnail_url RETURNING *`,
      )
        .bind(user.id, v.videoId, v.title, v.channelTitle, v.thumbnailUrl, now)
        .first();
      return json(
        {
          id: Number(row.id),
          videoId: row.video_id,
          title: row.title,
          channelTitle: row.channel_title,
          thumbnailUrl: row.thumbnail_url,
          createdAt: row.created_at,
        },
        201,
      );
    }
    if (method === "DELETE" && path.length === 3) {
      await env.DB.prepare(
        "DELETE FROM favorites WHERE user_id=? AND video_id=?",
      )
        .bind(user.id, path[2])
        .run();
      return json({ ok: true });
    }
  }

  if (path[0] === "rooms" && path.length === 1 && method === "POST") {
    requireKeys(body, ["name", "code", "isPrivate", "allowMemberAddSong"]);
    if (
      typeof body?.name !== "string" ||
      body.name.length < 2 ||
      body.name.length > 255
    )
      fail(400, "Room name is invalid.");
    if (
      body.code !== undefined &&
      (typeof body.code !== "string" ||
        body.code.trim().length < 3 ||
        body.code.trim().length > 20 ||
        !/^[A-Za-z0-9-]+$/.test(body.code.trim()))
    )
      fail(400, "Room code can only contain letters, numbers, and hyphens.");
    if (
      (body.isPrivate !== undefined && !isBoolean(body.isPrivate)) ||
      (body.allowMemberAddSong !== undefined &&
        !isBoolean(body.allowMemberAddSong))
    )
      fail(400, "Room settings are invalid.");
    let code = body.code?.trim().toUpperCase();
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; !code && i < 10; i++) {
      const candidate = Array.from(
        { length: 6 },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join("");
      if (
        !(await env.DB.prepare("SELECT id FROM rooms WHERE code=?")
          .bind(candidate)
          .first())
      )
        code = candidate;
    }
    if (!code) fail(500, "Could not generate a unique room code.");
    const exists = await env.DB.prepare(
      "SELECT id FROM rooms WHERE code=? COLLATE NOCASE",
    )
      .bind(code)
      .first();
    if (exists) fail(409, "Room code is already taken.");
    const now = isoNow();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO rooms (code,name,owner_id,is_private,allow_member_add_song,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ).bind(
        code,
        body.name,
        user.id,
        body.isPrivate ? 1 : 0,
        body.allowMemberAddSong === false ? 0 : 1,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO room_members (room_id,user_id,role,is_online,joined_at,last_seen_at) SELECT id,?,'owner',1,?,? FROM rooms WHERE code=?`,
      ).bind(user.id, now, now, code),
    ]);
    return json(await roomSnapshot(env, code, user.id), 201);
  }
  if (path[0] === "rooms" && path[1] === "me" && method === "GET") {
    const listSql = `SELECT m.role,m.joined_at,m.last_seen_at,r.*,
      (SELECT COUNT(*) FROM room_members mc WHERE mc.room_id=r.id) member_count,
      (SELECT COUNT(*) FROM room_members mo WHERE mo.room_id=r.id AND mo.is_online=1) online_count,
      (SELECT qi.title FROM room_queue qi WHERE qi.id=r.current_queue_item_id) current_title
      FROM room_members m JOIN rooms r ON r.id=m.room_id WHERE m.user_id=? AND m.role=? ORDER BY m.last_seen_at DESC,m.joined_at DESC LIMIT 20`;
    const [ownedRows, joinedRows] = await Promise.all([
      env.DB.prepare(listSql).bind(user.id, "owner").all(),
      env.DB.prepare(listSql).bind(user.id, "member").all(),
    ]);
    const owned = [],
      recentJoined = [];
    for (const r of ownedRows.results ?? [])
      owned.push({
        id: Number(r.id),
        code: r.code,
        name: r.name,
        ownerId: Number(r.owner_id),
        isPrivate: Boolean(r.is_private),
        playerStatus: r.player_status,
        currentVideoId: r.current_video_id,
        currentTitle: r.current_title,
        memberCount: Number(r.member_count),
        onlineMemberCount: Number(r.online_count),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        joinedAt: r.joined_at,
        lastSeenAt: r.last_seen_at,
      });
    for (const r of joinedRows.results ?? [])
      recentJoined.push({
        id: Number(r.id),
        code: r.code,
        name: r.name,
        ownerId: Number(r.owner_id),
        isPrivate: Boolean(r.is_private),
        playerStatus: r.player_status,
        currentVideoId: r.current_video_id,
        currentTitle: r.current_title,
        memberCount: Number(r.member_count),
        onlineMemberCount: Number(r.online_count),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        joinedAt: r.joined_at,
        lastSeenAt: r.last_seen_at,
      });
    return json({
      owned: owned.slice(0, 20),
      recentJoined: recentJoined.slice(0, 20),
    });
  }

  if (path[0] === "rooms" && path[1]) {
    const code = path[1];
    if (path.length === 2 && method === "GET")
      return json(await roomSnapshot(env, code, user.id));
    if (path.length === 3 && path[2] === "join" && method === "POST") {
      const room = await getRoom(env, code);
      const now = isoNow();
      await env.DB.prepare(
        `INSERT INTO room_members (room_id,user_id,role,is_online,joined_at,last_seen_at) VALUES (?,?,?,1,?,?)
        ON CONFLICT(room_id,user_id) DO UPDATE SET is_online=1,last_seen_at=excluded.last_seen_at`,
      )
        .bind(
          room.id,
          user.id,
          Number(room.owner_id) === Number(user.id) ? "owner" : "member",
          now,
          now,
        )
        .run();
      return json(await roomSnapshot(env, code, user.id), 201);
    }
    if (path.length === 3 && path[2] === "leave" && method === "POST") {
      await requireMember(env, code, user.id);
      await env.DB.prepare(
        "UPDATE room_members SET is_online=0,last_seen_at=? WHERE room_id=(SELECT id FROM rooms WHERE code=? COLLATE NOCASE) AND user_id=?",
      )
        .bind(isoNow(), code, user.id)
        .run();
      return json({ ok: true }, 201);
    }
    if (path.length === 3 && path[2] === "members" && method === "GET") {
      await requireMember(env, code, user.id);
      const rows = await env.DB.prepare(
        `SELECT m.*,u.username,u.avatar_url FROM room_members m JOIN users u ON u.id=m.user_id JOIN rooms r ON r.id=m.room_id WHERE r.code=? COLLATE NOCASE ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END,m.joined_at ASC`,
      )
        .bind(code)
        .all();
      return json(
        (rows.results ?? []).map((m) => ({
          id: Number(m.id),
          roomId: Number(m.room_id),
          userId: Number(m.user_id),
          username: m.username,
          avatarUrl: m.avatar_url,
          role: m.role,
          isOnline: Boolean(m.is_online),
          joinedAt: m.joined_at,
          lastSeenAt: m.last_seen_at,
        })),
      );
    }
    if (path.length === 2 && method === "PATCH") {
      requireKeys(body, [
        "name",
        "isPrivate",
        "allowMemberAddSong",
        "allowMemberRemoveOwnSong",
      ]);
      const room = await requireOwner(env, code, user.id);
      if (
        body.name !== undefined &&
        (typeof body.name !== "string" ||
          body.name.length < 2 ||
          body.name.length > 255)
      )
        fail(400, "Room name is invalid.");
      for (const key of [
        "isPrivate",
        "allowMemberAddSong",
        "allowMemberRemoveOwnSong",
      ])
        if (body[key] !== undefined && !isBoolean(body[key]))
          fail(400, "Room settings are invalid.");
      await env.DB.prepare(
        `UPDATE rooms SET name=?,is_private=?,allow_member_add_song=?,allow_member_remove_own_song=?,updated_at=? WHERE id=?`,
      )
        .bind(
          body.name ?? room.name,
          body.isPrivate === undefined
            ? room.is_private
            : Number(body.isPrivate),
          body.allowMemberAddSong === undefined
            ? room.allow_member_add_song
            : Number(body.allowMemberAddSong),
          body.allowMemberRemoveOwnSong === undefined
            ? room.allow_member_remove_own_song
            : Number(body.allowMemberRemoveOwnSong),
          isoNow(),
          room.id,
        )
        .run();
      return json(await roomSnapshot(env, code, user.id));
    }
    if (path.length === 2 && method === "DELETE") {
      const room = await requireRootOwner(env, code, user.id);
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE rooms SET current_queue_item_id=NULL WHERE id=?",
        ).bind(room.id),
        env.DB.prepare("DELETE FROM room_queue WHERE room_id=?").bind(room.id),
        env.DB.prepare("DELETE FROM room_members WHERE room_id=?").bind(
          room.id,
        ),
        env.DB.prepare("DELETE FROM rooms WHERE id=?").bind(room.id),
      ]);
      return json({ ok: true });
    }
    if (
      path.length === 4 &&
      path[2] === "owner" &&
      path[3] === "assign" &&
      method === "POST"
    ) {
      requireKeys(body, ["userId"]);
      if (!isInteger(body?.userId, 1))
        fail(400, "userId must be a positive integer.");
      const room = await requireOwner(env, code, user.id);
      const target = await env.DB.prepare(
        "SELECT id FROM room_members WHERE room_id=? AND user_id=?",
      )
        .bind(room.id, body.userId)
        .first();
      if (!target) fail(403, "Target user is not a room member.");
      await env.DB.prepare(
        `UPDATE room_members SET role='owner' WHERE room_id=? AND user_id=?`,
      )
        .bind(room.id, body.userId)
        .run();
      return json(await roomSnapshot(env, code, body.userId), 201);
    }
    if (
      path.length === 4 &&
      path[2] === "owner" &&
      path[3] === "demote" &&
      method === "POST"
    ) {
      requireKeys(body, ["userId"]);
      if (!isInteger(body?.userId, 1))
        fail(400, "userId must be a positive integer.");
      const room = await requireRootOwner(env, code, user.id);
      if (body.userId === user.id)
        fail(403, "Root owner cannot demote themselves.");
      const target = await env.DB.prepare(
        "SELECT id,role FROM room_members WHERE room_id=? AND user_id=?",
      )
        .bind(room.id, body.userId)
        .first();
      if (!target) fail(403, "Target user is not a room member.");
      if (target.role === "owner")
        await env.DB.prepare(`UPDATE room_members SET role='member' WHERE id=?`)
          .bind(target.id)
          .run();
      return json(await roomSnapshot(env, code, user.id), 201);
    }
    if (
      path.length === 4 &&
      path[2] === "members" &&
      path[3] === "kick" &&
      method === "POST"
    ) {
      requireKeys(body, ["userId"]);
      if (!isInteger(body?.userId, 1))
        fail(400, "userId must be a positive integer.");
      const room = await requireOwner(env, code, user.id);
      if (body.userId === user.id) fail(403, "You cannot kick yourself.");
      const target = await env.DB.prepare(
        "SELECT id,role FROM room_members WHERE room_id=? AND user_id=?",
      )
        .bind(room.id, body.userId)
        .first();
      if (!target) fail(403, "Target user is not a room member.");
      if (target.role === "owner")
        fail(403, "Owners cannot kick another owner.");
      await env.DB.prepare("DELETE FROM room_members WHERE id=?")
        .bind(target.id)
        .run();
      return json(await roomSnapshot(env, code, user.id), 201);
    }

    if (path.length === 3 && path[2] === "queue" && method === "GET") {
      await requireMember(env, code, user.id);
      return json(await getQueue(env, (await getRoom(env, code)).id));
    }
    if (path.length === 3 && path[2] === "queue" && method === "POST") {
      requireKeys(body, ["videoId"]);
      const member = await requireMember(env, code, user.id);
      const room = await getRoom(env, code);
      if (member.role !== "owner" && !room.allow_member_add_song)
        fail(403, "Members are not allowed to add songs in this room.");
      const v = await youtubeVideo(env, body?.videoId);
      if (!v.embeddable) fail(403, "This YouTube video cannot be embedded.");
      const now = isoNow();
      const item = await env.DB.prepare(
        `INSERT INTO room_queue (room_id,video_id,title,channel_title,thumbnail_url,duration_seconds,added_by,position,status,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,COALESCE(MAX(position),0)+1,'queued',?,? FROM room_queue WHERE room_id=? RETURNING *`,
      )
        .bind(
          room.id,
          v.videoId,
          v.title,
          v.channelTitle,
          v.thumbnailUrl,
          v.durationSeconds,
          user.id,
          now,
          now,
          room.id,
        )
        .first();
      return json(publicQueueItem(item), 201);
    }
    if (path.length === 4 && path[2] === "queue" && method === "DELETE") {
      const queueId = Number(path[3]);
      if (!isInteger(queueId, 1)) fail(400, "queueId is invalid.");
      const member = await requireMember(env, code, user.id);
      const room = await getRoom(env, code);
      const item = await env.DB.prepare(
        "SELECT * FROM room_queue WHERE id=? AND room_id=? AND status!='removed'",
      )
        .bind(queueId, room.id)
        .first();
      if (!item) fail(404, "Queue item not found.");
      if (
        member.role !== "owner" &&
        !(
          Number(item.added_by) === Number(user.id) &&
          room.allow_member_remove_own_song
        )
      )
        fail(403, "Only the owner can remove this song.");
      const now = isoNow();
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE room_queue SET status='removed',updated_at=? WHERE id=?`,
        ).bind(now, item.id),
        env.DB.prepare(
          `UPDATE rooms SET current_queue_item_id=NULL,current_video_id=NULL,current_time=0,player_status='idle',started_at=NULL,updated_at=? WHERE id=? AND current_queue_item_id=?`,
        ).bind(now, room.id, item.id),
      ]);
      return json({ ok: true });
    }
    if (
      path.length === 4 &&
      path[2] === "queue" &&
      path[3] === "reorder" &&
      method === "PATCH"
    ) {
      requireKeys(body, ["queueItemIds"]);
      const room = await requireOwner(env, code, user.id);
      if (
        !Array.isArray(body?.queueItemIds) ||
        body.queueItemIds.length < 1 ||
        !body.queueItemIds.every((id) => isInteger(id, 1))
      )
        fail(400, "Queue reorder payload is invalid.");
      const existing = await env.DB.prepare(
        `SELECT id FROM room_queue WHERE room_id=? AND status='queued'`,
      )
        .bind(room.id)
        .all();
      const current = (existing.results ?? [])
        .map((r) => Number(r.id))
        .sort((a, b) => a - b);
      const requested = [...body.queueItemIds].sort((a, b) => a - b);
      if (
        current.length !== requested.length ||
        current.some((id, i) => id !== requested[i])
      )
        fail(
          403,
          "Queue reorder payload must contain every queued item exactly once.",
        );
      const now = isoNow();
      await env.DB.batch(
        body.queueItemIds.map((id, index) =>
          env.DB.prepare(
            "UPDATE room_queue SET position=?,updated_at=? WHERE id=? AND room_id=? AND status='queued'",
          ).bind(index + 1, now, id, room.id),
        ),
      );
      return json(await getQueue(env, room.id));
    }
    if (
      path.length === 4 &&
      path[2] === "queue" &&
      path[3] === "next" &&
      method === "POST"
    ) {
      const room = await requireOwner(env, code, user.id);
      return json(await nextTrack(env, room), 201);
    }
    if (
      path.length === 5 &&
      path[2] === "queue" &&
      path[4] === "play-now" &&
      method === "POST"
    ) {
      const room = await requireOwner(env, code, user.id);
      const queueId = Number(path[3]);
      if (!isInteger(queueId, 1)) fail(400, "queueId is invalid.");
      const target = await env.DB.prepare(
        `SELECT * FROM room_queue WHERE id=? AND room_id=? AND status='queued'`,
      )
        .bind(queueId, room.id)
        .first();
      if (!target) fail(404, "Queue item not found.");
      const now = isoNow();
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE room_queue SET status='played',updated_at=? WHERE room_id=? AND status='playing'`,
        ).bind(now, room.id),
        env.DB.prepare(
          `UPDATE room_queue SET status='playing',updated_at=? WHERE id=? AND status='queued'`,
        ).bind(now, target.id),
        env.DB.prepare(
          `UPDATE rooms SET current_queue_item_id=?,current_video_id=?,current_time=0,player_status='playing',started_at=?,updated_at=? WHERE id=?`,
        ).bind(target.id, target.video_id, now, now, room.id),
      ]);
      const updated = await getRoom(env, code);
      return json(
        {
          state: await serializePlayer(env, updated),
          queue: await getQueue(env, room.id),
        },
        201,
      );
    }

    if (
      (path.length === 3 && path[2] === "player-state" && method === "GET") ||
      (path.length === 4 &&
        path[2] === "player" &&
        path[3] === "sync" &&
        method === "POST")
    ) {
      await requireMember(env, code, user.id);
      return json(await serializePlayer(env, await getRoom(env, code)), 201);
    }
    if (
      path.length === 4 &&
      path[2] === "player" &&
      ["play", "pause", "seek"].includes(path[3]) &&
      method === "POST"
    ) {
      requireKeys(body, ["currentTime"]);
      if (
        typeof body?.currentTime !== "number" ||
        !Number.isFinite(body.currentTime) ||
        body.currentTime < 0
      )
        fail(400, "currentTime is invalid.");
      const room = await requireOwner(env, code, user.id);
      let current = room;
      if (path[3] === "play" && !room.current_video_id) {
        const first = await env.DB.prepare(
          `SELECT * FROM room_queue WHERE room_id=? AND status='queued' ORDER BY position ASC LIMIT 1`,
        )
          .bind(room.id)
          .first();
        if (first) {
          const now = isoNow();
          await env.DB.batch([
            env.DB.prepare(
              `UPDATE room_queue SET status='playing',updated_at=? WHERE id=? AND status='queued'`,
            ).bind(now, first.id),
            env.DB.prepare(
              `UPDATE rooms SET current_queue_item_id=?,current_video_id=?,current_time=0,updated_at=? WHERE id=?`,
            ).bind(first.id, first.video_id, now, room.id),
          ]);
          current = await getRoom(env, code);
        }
      }
      const now = isoNow();
      const status =
        path[3] === "play"
          ? "playing"
          : path[3] === "pause"
            ? "paused"
            : current.player_status;
      const started = status === "playing" ? now : null;
      await env.DB.prepare(
        "UPDATE rooms SET current_time=?,player_status=?,started_at=?,updated_at=? WHERE id=?",
      )
        .bind(body.currentTime, status, started, now, current.id)
        .run();
      return json(await serializePlayer(env, await getRoom(env, code)), 201);
    }
    if (
      path.length === 4 &&
      path[2] === "player" &&
      path[3] === "force-sync" &&
      method === "POST"
    ) {
      const room = await requireOwner(env, code, user.id);
      return json(await serializePlayer(env, room), 201);
    }
    if (
      path.length === 4 &&
      path[2] === "player" &&
      path[3] === "ended" &&
      method === "POST"
    ) {
      const room = await requireOwner(env, code, user.id);
      return json(await nextTrack(env, room), 201);
    }
  }
  return json({ message: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigins = String(env.FRONTEND_URL ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const origin = request.headers.get("Origin");
    const headers = {};
    if (origin && allowedOrigins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-credentials"] = "true";
      headers.vary = "Origin";
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "Content-Type, Authorization",
        },
      });
    }
    if (origin && !allowedOrigins.includes(origin))
      return json({ message: "Origin is not allowed." }, 403);
    try {
      if (url.pathname.startsWith("/realtime/")) {
        const code = decodeURIComponent(
          url.pathname.slice("/realtime/".length),
        );
        const token = protocolToken(request);
        const claims = token ? await verifyToken(token, env.JWT_SECRET) : null;
        const socketUser = claims?.sub
          ? await env.DB.prepare(
              "SELECT id,email,username,avatar_url FROM users WHERE id=?",
            )
              .bind(claims.sub)
              .first()
          : null;
        if (!socketUser)
          return json({ message: "Authentication required." }, 401, headers);
        const id = env.ROOMS.idFromName(code.toUpperCase());
        return env.ROOMS.get(id).fetch(request);
      }
      const response = await handle(request, env);
      const mergedHeaders = new Headers(response.headers);
      for (const [name, value] of Object.entries(headers))
        mergedHeaders.set(name, value);
      return new Response(response.body, {
        status: response.status,
        headers: mergedHeaders,
      });
    } catch (error) {
      if (!error?.status) console.error("Worker request failed", error);
      return json(
        { message: error?.status ? error.message : "Internal server error." },
        error?.status ?? 500,
        headers,
      );
    }
  },
};

function sendSocketEvent(socket, event, data) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ event, data }));
}

function protocolToken(request) {
  return (
    (request.headers.get("Sec-WebSocket-Protocol") ?? "")
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.startsWith("bearer."))
      ?.slice(7) ?? new URL(request.url).searchParams.get("token")
  );
}

export class MusicRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket")
      return json({ message: "WebSocket upgrade required." }, 426);
    const url = new URL(request.url);
    const code = decodeURIComponent(url.pathname.slice("/realtime/".length));
    const token = protocolToken(request);
    const claims = token ? await verifyToken(token, this.env.JWT_SECRET) : null;
    const user = claims?.sub
      ? await this.env.DB.prepare(
          "SELECT id,email,username,avatar_url FROM users WHERE id=?",
        )
          .bind(claims.sub)
          .first()
      : null;
    if (!user) return json({ message: "Authentication required." }, 401);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({
      roomCode: code.toUpperCase(),
      user: publicUser(user),
      joined: false,
    });
    this.state.acceptWebSocket(server);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": "music-room" },
    });
  }

  async webSocketMessage(socket, message) {
    let envelope;
    try {
      envelope = JSON.parse(
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message),
      );
    } catch {
      sendSocketEvent(socket, "exception", {
        message: "Invalid realtime message.",
      });
      return;
    }
    const { id, event, payload = {} } = envelope ?? {};
    const attachment = socket.deserializeAttachment();
    if (
      !attachment?.user ||
      typeof event !== "string" ||
      !payload ||
      typeof payload !== "object"
    ) {
      sendSocketEvent(socket, "exception", {
        message: "Invalid realtime message.",
      });
      return;
    }
    if (
      payload.roomCode &&
      String(payload.roomCode).toUpperCase() !== attachment.roomCode
    ) {
      sendSocketEvent(socket, "exception", {
        message: "Socket is connected to another room.",
      });
      return;
    }
    const code = attachment.roomCode;
    const user = attachment.user;
    const route = (suffix) => `/rooms/${encodeURIComponent(code)}${suffix}`;
    const call = async (path, method = "GET", body = undefined) => {
      const request = new Request(`https://worker.internal${path}`, {
        method,
        headers:
          body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const response = await handle(request, this.env, user);
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.message ?? `Request failed (${response.status}).`);
      return data;
    };
    const broadcast = (name, data) => {
      for (const peer of this.state.getWebSockets())
        if (peer.deserializeAttachment()?.joined)
          sendSocketEvent(peer, name, data);
    };
    const broadcastRoom = async () => {
      const room = await call(route(""));
      broadcast("room:state", room);
      broadcast("room:member:update", room.members);
      broadcast("room:queue:update", room.queue);
      broadcast("room:player:state", room.playerState);
      return room;
    };

    try {
      let result;
      if (event === "room:join") {
        result = await call(route("/join"), "POST");
        socket.serializeAttachment({ ...attachment, joined: true });
        const room = await broadcastRoom();
        result = room;
      } else if (!attachment.joined && event !== "room:leave") {
        throw new Error("Join the room before sending events.");
      } else if (event === "room:leave") {
        socket.serializeAttachment({ ...attachment, joined: false });
        const anotherSocket = this.state.getWebSockets().some((peer) => {
          const info = peer.deserializeAttachment();
          return info?.joined && Number(info.user.id) === Number(user.id);
        });
        if (!anotherSocket) await call(route("/leave"), "POST");
        try {
          await broadcastRoom();
        } catch {}
        result = { ok: true };
      } else if (event === "room:delete") {
        result = await call(route(""), "DELETE");
        for (const peer of this.state.getWebSockets()) {
          if (!peer.deserializeAttachment()?.joined) continue;
          sendSocketEvent(peer, "room:deleted", { roomCode: code });
          peer.serializeAttachment({
            ...peer.deserializeAttachment(),
            joined: false,
          });
          peer.close(1000, "Room deleted");
        }
      } else if (
        event === "room:member:promote-owner" ||
        event === "room:member:demote-owner" ||
        event === "room:member:kick"
      ) {
        const action = event.endsWith("promote-owner")
          ? "/owner/assign"
          : event.endsWith("demote-owner")
            ? "/owner/demote"
            : "/members/kick";
        result = await call(route(action), "POST", { userId: payload.userId });
        if (event.endsWith(":kick")) {
          for (const peer of this.state.getWebSockets()) {
            const info = peer.deserializeAttachment();
            if (
              info?.joined &&
              Number(info.user.id) === Number(payload.userId)
            ) {
              sendSocketEvent(peer, "room:kicked", { roomCode: code });
              peer.serializeAttachment({ ...info, joined: false });
              peer.close(1008, "Removed from room");
            }
          }
        }
        await broadcastRoom();
      } else if (event === "room:queue:add") {
        await call(route("/queue"), "POST", { videoId: payload.videoId });
        const room = await call(route(""));
        if (
          !room.playerState.currentVideoId &&
          room.members.some(
            (member) => member.userId === user.id && member.role === "owner",
          )
        ) {
          await call(route("/player/play"), "POST", { currentTime: 0 });
          const [state, queue] = await Promise.all([
            call(route("/player-state")),
            call(route("/queue")),
          ]);
          broadcast("room:player:state", state);
          broadcast("room:queue:update", queue);
          result = queue;
        } else {
          result = await call(route("/queue"));
          broadcast("room:queue:update", result);
        }
      } else if (event === "room:queue:remove") {
        await call(route(`/queue/${Number(payload.queueItemId)}`), "DELETE");
        result = await call(route("/queue"));
        broadcast("room:queue:update", result);
      } else if (event === "room:queue:reorder") {
        result = await call(route("/queue/reorder"), "PATCH", {
          queueItemIds: payload.queueItemIds,
        });
        broadcast("room:queue:update", result);
      } else if (event === "room:queue:play-now") {
        result = await call(
          route(`/queue/${Number(payload.queueItemId)}/play-now`),
          "POST",
        );
        broadcast("room:player:next", result);
        broadcast("room:player:state", result.state);
        broadcast("room:queue:update", result.queue);
      } else if (
        event === "room:player:play" ||
        event === "room:player:pause" ||
        event === "room:player:seek"
      ) {
        const action = event.slice("room:player:".length);
        result = await call(route(`/player/${action}`), "POST", {
          currentTime: payload.currentTime,
        });
        if (action === "seek") broadcast("room:player:seek", result);
        else {
          broadcast("room:player:state", result);
          if (action === "play")
            broadcast("room:queue:update", await call(route("/queue")));
        }
      } else if (event === "room:player:ended") {
        result = await call(route("/player/ended"), "POST");
        broadcast("room:player:next", result);
        broadcast("room:player:state", result.state);
        broadcast("room:queue:update", result.queue);
      } else if (event === "room:player:force-sync") {
        result =
          typeof payload.currentTime === "number"
            ? await call(route("/player/seek"), "POST", {
                currentTime: payload.currentTime,
              })
            : await call(route("/player/force-sync"), "POST");
        broadcast("room:player:force-sync", result);
      } else if (event === "room:player:sync") {
        result = await call(route("/player/sync"), "POST");
        sendSocketEvent(socket, "room:player:state", result);
      } else {
        throw new Error("Unknown realtime event.");
      }
      if (id !== undefined)
        sendSocketEvent(socket, "__ack", { id, data: result });
    } catch (error) {
      const message = error?.message ?? "Realtime request failed.";
      sendSocketEvent(socket, "exception", { message });
      if (id !== undefined)
        sendSocketEvent(socket, "__ack", { id, error: message });
    }
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment();
    if (!attachment?.joined) return;
    const stillConnected = this.state.getWebSockets().some((peer) => {
      const other = peer.deserializeAttachment();
      return (
        other?.joined && Number(other.user.id) === Number(attachment.user.id)
      );
    });
    if (stillConnected) return;
    try {
      const room = await getRoom(this.env, attachment.roomCode);
      await this.env.DB.prepare(
        "UPDATE room_members SET is_online=0,last_seen_at=? WHERE room_id=? AND user_id=?",
      )
        .bind(isoNow(), room.id, attachment.user.id)
        .run();
      const payload = await roomPayload(
        this.env,
        await getRoom(this.env, attachment.roomCode),
      );
      for (const peer of this.state.getWebSockets())
        if (peer.deserializeAttachment()?.joined) {
          sendSocketEvent(peer, "room:state", payload);
          sendSocketEvent(peer, "room:member:update", payload.members);
          sendSocketEvent(peer, "room:queue:update", payload.queue);
          sendSocketEvent(peer, "room:player:state", payload.playerState);
        }
    } catch {
      /* Room may have been deleted while the socket was closing. */
    }
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }
}
