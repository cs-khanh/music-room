import type { RoomPlayerState } from './player';
import type { RoomQueueItem } from './queue';
import type { Room, RoomMember } from './room';

export type ServerToClientEvents = {
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

export type ClientToServerEvents = {
  'room:join': (payload: { roomCode: string }) => void;
  'room:leave': (payload: { roomCode: string }) => void;
  'room:queue:add': (payload: { roomCode: string; videoId: string }) => void;
  'room:queue:remove': (payload: { roomCode: string; queueItemId: number }) => void;
  'room:queue:reorder': (payload: { roomCode: string; queueItemIds: number[] }) => void;
  'room:player:play': (payload: { roomCode: string; currentTime: number }) => void;
  'room:player:pause': (payload: { roomCode: string; currentTime: number }) => void;
  'room:player:seek': (payload: { roomCode: string; currentTime: number }) => void;
  'room:player:ended': (payload: { roomCode: string }) => void;
  'room:player:sync': (payload: { roomCode: string }) => void;
  'room:player:force-sync': (payload: { currentTime?: number; roomCode: string }) => void;
};
