import type { ClientToServerEvents, ServerToClientEvents } from '@music-room/shared';
import { io, type Socket } from 'socket.io-client';
import { env } from '@/config/env';
import { getAccessToken } from '@/lib/auth-token';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let connectedUserId: number | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(env.socketUrl, {
      auth: () => ({
        token: getAccessToken()
      }),
      autoConnect: false,
      withCredentials: true
    });
  }

  return socket;
}

export function connectSocketForUser(userId: number) {
  const nextSocket = getSocket();
  if (connectedUserId !== null && connectedUserId !== userId && nextSocket.connected) {
    nextSocket.disconnect();
  }

  nextSocket.auth = {
    token: getAccessToken()
  };
  connectedUserId = userId;

  if (!nextSocket.connected) {
    nextSocket.connect();
  }

  return nextSocket;
}

export function resetSocket() {
  if (socket) {
    socket.disconnect();
  }

  connectedUserId = null;
}
