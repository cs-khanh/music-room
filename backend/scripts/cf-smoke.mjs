const baseUrl = process.env.CF_API_URL ?? "http://127.0.0.1:8790";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = "GET", token, body, cookie } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return {
    status: response.status,
    data,
    cookies: response.headers.getSetCookie?.() ?? [],
  };
}

async function register(name) {
  const result = await request("/auth/register", {
    method: "POST",
    body: {
      email: `cf-${name}-${runId}@example.invalid`,
      username: `CF ${name}`,
      password: "Local-Smoke-Only-123",
    },
  });
  assert(
    result.status === 201 && result.data?.accessToken,
    `${name} registration failed: ${result.status} ${result.data?.message ?? ""}`,
  );
  return { ...result.data, cookies: result.cookies };
}

function openSocket(roomCode, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${baseUrl.replace(/^http/, "ws")}/realtime/${encodeURIComponent(roomCode)}`,
      ["music-room", `bearer.${token}`],
    );
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket connection timed out."));
    }, 5000);
    ws.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve(ws);
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("WebSocket connection failed."));
      },
      { once: true },
    );
  });
}

function sendEvent(ws, event, payload = {}) {
  const id = Math.floor(Math.random() * 1_000_000_000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Realtime event timed out: ${event}`)),
      5000,
    );
    const listener = (message) => {
      const envelope = JSON.parse(message.data);
      if (envelope.event !== "__ack" || envelope.data?.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener("message", listener);
      if (envelope.data.error) reject(new Error(envelope.data.error));
      else resolve(envelope.data.data);
    };
    ws.addEventListener("message", listener);
    ws.send(
      JSON.stringify({
        id,
        event,
        payload: { ...payload, roomCode: payload.roomCode ?? undefined },
      }),
    );
  });
}

function waitForEvent(ws, eventName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Realtime broadcast timed out: ${eventName}`)),
      5000,
    );
    const listener = (message) => {
      const envelope = JSON.parse(message.data);
      if (envelope.event !== eventName) return;
      clearTimeout(timer);
      ws.removeEventListener("message", listener);
      resolve(envelope.data);
    };
    ws.addEventListener("message", listener);
  });
}

async function main() {
  const health = await request("/health");
  assert(
    health.status === 200 && health.data?.database === "d1",
    "D1 health check failed.",
  );
  const host = new URL(baseUrl).hostname;
  if (host === "127.0.0.1" || host === "localhost") {
    const cors = await fetch(new URL("/health", baseUrl), {
      headers: { origin: "http://localhost:3000" },
    });
    assert(
      cors.headers.get("access-control-allow-origin") === "http://localhost:3000",
      "Configured CORS origin was not returned.",
    );
  }
  const owner = await register("owner");
  const member = await register("member");
  const me = await request("/auth/me", { token: owner.accessToken });
  assert(
    me.status === 200 && me.data.id === owner.user.id,
    "Authenticated profile lookup failed.",
  );
  const refreshCookie = owner.cookies
    .find((value) => value.startsWith("refresh_token="))
    ?.split(";")[0];
  assert(refreshCookie, "Refresh cookie was not set.");
  const refreshed = await request("/auth/refresh", {
    method: "POST",
    cookie: refreshCookie,
  });
  assert(
    refreshed.status === 201 && refreshed.data?.accessToken,
    "Refresh token flow failed.",
  );
  const passwordChanged = await request("/auth/change-password", {
    method: "POST",
    token: owner.accessToken,
    body: {
      currentPassword: "Local-Smoke-Only-123",
      newPassword: "Local-Smoke-Changed-123",
    },
  });
  assert(passwordChanged.status === 201, "Password change failed.");
  const login = await request("/auth/login", {
    method: "POST",
    body: { email: owner.user.email, password: "Local-Smoke-Changed-123" },
  });
  assert(
    login.status === 201 && login.data?.accessToken,
    "Login after password change failed.",
  );
  owner.accessToken = login.data.accessToken;
  const created = await request("/rooms", {
    method: "POST",
    token: owner.accessToken,
    body: { name: `Smoke ${runId}`, allowMemberAddSong: false },
  });
  assert(
    created.status === 201 && created.data?.code,
    `Room creation failed: ${created.status} ${created.data?.message ?? ""}`,
  );
  const code = created.data.code;

  const joined = await request(`/rooms/${code}/join`, {
    method: "POST",
    token: member.accessToken,
  });
  assert(
    joined.status === 201 &&
      joined.data.members.some((entry) => entry.userId === member.user.id),
    "Room join failed.",
  );
  const deniedAdd = await request(`/rooms/${code}/queue`, {
    method: "POST",
    token: member.accessToken,
    body: { videoId: "dQw4w9WgXcQ" },
  });
  assert(
    deniedAdd.status === 403,
    `Member add-song permission was not enforced (${deniedAdd.status}).`,
  );
  const deniedControl = await request(`/rooms/${code}/player/play`, {
    method: "POST",
    token: member.accessToken,
    body: { currentTime: 0 },
  });
  assert(
    deniedControl.status === 403,
    `Member player permission was not enforced (${deniedControl.status}).`,
  );

  const promoted = await request(`/rooms/${code}/owner/assign`, {
    method: "POST",
    token: owner.accessToken,
    body: { userId: member.user.id },
  });
  assert(
    promoted.status === 201 &&
      promoted.data.members.some(
        (entry) => entry.userId === member.user.id && entry.role === "owner",
      ),
    "Owner promotion failed.",
  );
  const demoted = await request(`/rooms/${code}/owner/demote`, {
    method: "POST",
    token: owner.accessToken,
    body: { userId: member.user.id },
  });
  assert(
    demoted.status === 201 &&
      demoted.data.members.some(
        (entry) => entry.userId === member.user.id && entry.role === "member",
      ),
    "Owner demotion failed.",
  );

  const wsOwner = await openSocket(code, owner.accessToken);
  const wsMember = await openSocket(code, member.accessToken);
  const joinedOwner = await sendEvent(wsOwner, "room:join", { roomCode: code });
  const joinedMember = await sendEvent(wsMember, "room:join", {
    roomCode: code,
  });
  assert(
    joinedOwner.code === code && joinedMember.code === code,
    "Realtime room join failed.",
  );
  const memberStateUpdate = waitForEvent(wsMember, "room:player:state");
  const realtimeState = await sendEvent(wsOwner, "room:player:play", {
    roomCode: code,
    currentTime: 0,
  });
  const broadcastState = await memberStateUpdate;
  assert(
    realtimeState.status === "playing" && broadcastState.status === "playing",
    "Realtime player update/broadcast failed.",
  );
  wsOwner.close();
  wsMember.close();

  const rooms = await request("/rooms/me", { token: owner.accessToken });
  assert(
    rooms.status === 200 && rooms.data.owned.some((room) => room.code === code),
    "My rooms listing failed.",
  );
  const deleted = await request(`/rooms/${code}`, {
    method: "DELETE",
    token: owner.accessToken,
  });
  assert(deleted.status === 200 && deleted.data.ok, "Room deletion failed.");
  const missing = await request(`/rooms/${code}`, { token: owner.accessToken });
  assert(
    missing.status === 403,
    `Deleted room access behavior changed (${missing.status}).`,
  );
  console.log(
    "Cloudflare Worker smoke passed: health/CORS, auth/refresh/password, room permissions/ownership, Durable Object WebSocket broadcasts, room list/delete.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
