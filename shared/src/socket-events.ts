import type { RoomPlayerState } from './player';
import type { RoomQueueItem } from './queue';
import type { Room, RoomMember } from './room';

export type ServerToClientEvents = {
  'room:deleted': (payload: { roomCode: string }) => void;
  'room:kicked': (payload: { roomCode: string }) => void;
  'room:member:update': (members: RoomMember[]) => void;
  'room:owner:changed': (payload: { roomCode: string; ownerId: number }) => void;
  'room:state': (room: Room) => void;
  'room:queue:update': (queue: RoomQueueItem[]) => void;
  'room:player:state': (state: RoomPlayerState) => void;
  'room:player:seek': (state: RoomPlayerState) => void;
  'room:player:next': (payload: { state: RoomPlayerState; queue: RoomQueueItem[] }) => void;
  'room:player:force-sync': (state: RoomPlayerState) => void;
  error: (payload: { code: string; message: string }) => void;
};

export type PlayerQueuePayload = { state: RoomPlayerState; queue: RoomQueueItem[] };

export type ClientToServerEvents = {
  'room:join': (payload: { roomCode: string }, callback?: (room: Room) => void) => void;
  'room:leave': (payload: { roomCode: string }, callback?: (payload: { ok: true }) => void) => void;
  'room:delete': (payload: { roomCode: string }, callback?: (payload: { ok: true }) => void) => void;
  'room:member:demote-owner': (payload: { roomCode: string; userId: number }, callback?: (room: Room) => void) => void;
  'room:member:kick': (payload: { roomCode: string; userId: number }, callback?: (room: Room) => void) => void;
  'room:member:promote-owner': (payload: { roomCode: string; userId: number }, callback?: (room: Room) => void) => void;
  'room:queue:add': (payload: { roomCode: string; videoId: string }, callback?: (queue: RoomQueueItem[]) => void) => void;
  'room:queue:remove': (payload: { roomCode: string; queueItemId: number }, callback?: (queue: RoomQueueItem[]) => void) => void;
  'room:queue:reorder': (payload: { roomCode: string; queueItemIds: number[] }, callback?: (queue: RoomQueueItem[]) => void) => void;
  'room:queue:play-now': (payload: { roomCode: string; queueItemId: number }, callback?: (payload: PlayerQueuePayload) => void) => void;
  'room:player:play': (payload: { roomCode: string; currentTime: number }, callback?: (state: RoomPlayerState) => void) => void;
  'room:player:pause': (payload: { roomCode: string; currentTime: number }, callback?: (state: RoomPlayerState) => void) => void;
  'room:player:seek': (payload: { roomCode: string; currentTime: number }) => void;
  'room:player:ended': (payload: { roomCode: string }, callback?: (payload: PlayerQueuePayload) => void) => void;
  'room:player:sync': (payload: { roomCode: string }, callback?: (state: RoomPlayerState) => void) => void;
  'room:player:force-sync': (payload: { currentTime?: number; roomCode: string }, callback?: (state: RoomPlayerState) => void) => void;
};
