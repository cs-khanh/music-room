import { env } from "@/config/env";
import { getAccessToken } from "@/lib/auth-token";

type Handler = (...args: any[]) => void;
type Envelope = { event?: string; data?: any };

class RoomRealtimeSocket {
  private handlers = new Map<string, Set<Handler>>();
  private webSocket: WebSocket | null = null;
  private sequence = 0;
  private callbacks = new Map<number, (data: any) => void>();
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private intentionallyClosed = false;
  private socketId: string | null = null;

  constructor(
    private readonly userId: number,
    private readonly roomCode: string,
  ) {}

  get connected() {
    return this.webSocket?.readyState === WebSocket.OPEN;
  }

  get id() {
    return this.socketId ?? undefined;
  }

  on(event: string, handler: Handler) {
    const handlers = this.handlers.get(event) ?? new Set<Handler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  off(event: string, handler?: Handler) {
    if (!handler) this.handlers.delete(event);
    else {
      const handlers = this.handlers.get(event);
      handlers?.delete(handler);
      if (handlers?.size === 0) this.handlers.delete(event);
    }
    return this;
  }

  emit(event: string, payload?: unknown, callback?: (data: any) => void) {
    const socket = this.webSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      if (callback)
        callback({
          ok: false,
          message: "Realtime connection is not available.",
        });
      return this;
    }
    const id = callback ? ++this.sequence : undefined;
    if (callback && id !== undefined) this.callbacks.set(id, callback);
    socket.send(JSON.stringify({ id, event, payload: payload ?? {} }));
    return this;
  }

  connect() {
    this.intentionallyClosed = false;
    if (
      this.webSocket &&
      (this.webSocket.readyState === WebSocket.OPEN ||
        this.webSocket.readyState === WebSocket.CONNECTING)
    )
      return this;
    const token = getAccessToken();
    if (!token) {
      this.dispatch("connect_error", new Error("Authentication is required."));
      return this;
    }
    const endpoint = new URL(env.socketUrl!);
    endpoint.protocol =
      endpoint.protocol === "https:" || endpoint.protocol === "wss:"
        ? "wss:"
        : "ws:";
    endpoint.pathname = `/realtime/${encodeURIComponent(this.roomCode)}`;
    endpoint.search = "";
    this.socketId = `${this.userId}-${crypto.randomUUID()}`;
    const socket = new WebSocket(endpoint, ["music-room", `bearer.${token}`]);
    this.webSocket = socket;
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.dispatch("connect");
    };
    socket.onmessage = (message) => this.handleMessage(message.data);
    socket.onerror = () =>
      this.dispatch("connect_error", new Error("Realtime connection failed."));
    socket.onclose = (event) => {
      this.socketId = null;
      this.callbacks.forEach((callback) =>
        callback({ ok: false, message: "Realtime connection closed." }),
      );
      this.callbacks.clear();
      this.dispatch("disconnect", event.reason || "connection closed");
      if (!this.intentionallyClosed) this.scheduleReconnect();
    };
    return this;
  }

  disconnect() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.webSocket?.close(1000, "Client disconnected");
    this.webSocket = null;
    return this;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    try {
      const envelope = JSON.parse(raw) as Envelope;
      if (envelope.event === "__ack") {
        const ack = envelope.data as {
          id?: number;
          data?: unknown;
          error?: string;
        };
        const callback =
          ack?.id === undefined ? undefined : this.callbacks.get(ack.id);
        if (ack?.id !== undefined) this.callbacks.delete(ack.id);
        if (callback)
          callback(ack.error ? { ok: false, message: ack.error } : ack.data);
        return;
      }
      if (envelope.event) this.dispatch(envelope.event, envelope.data);
    } catch {
      this.dispatch("exception", {
        message: "Received an invalid realtime event.",
      });
    }
  }

  private dispatch(event: string, ...args: any[]) {
    this.handlers.get(event)?.forEach((handler) => handler(...args));
  }
}

let socket: RoomRealtimeSocket | null = null;
let connectedUserId: number | null = null;
let connectedRoomCode: string | null = null;

export function getSocket() {
  if (!socket) socket = new RoomRealtimeSocket(0, "");
  return socket;
}

export function connectSocketForUser(userId: number, roomCode: string) {
  if (
    socket &&
    (connectedUserId !== userId || connectedRoomCode !== roomCode)
  ) {
    socket.disconnect();
    socket = null;
  }
  if (!socket) socket = new RoomRealtimeSocket(userId, roomCode);
  connectedUserId = userId;
  connectedRoomCode = roomCode;
  socket.connect();
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
  connectedUserId = null;
  connectedRoomCode = null;
}
