import type { RoomQueueItem } from './queue';

export type PlayerStatus = 'idle' | 'playing' | 'paused';

export type RoomPlayerState = {
  roomId: number;
  currentVideoId: string | null;
  currentQueueItemId: number | null;
  currentQueueItem?: RoomQueueItem | null;
  status: PlayerStatus;
  currentTime: number;
  startedAt: string | null;
  updatedBy: number;
};

export function getRealCurrentTime(state: RoomPlayerState, now = Date.now()): number {
  if (state.status !== 'playing' || !state.startedAt) {
    return state.currentTime;
  }

  return state.currentTime + (now - new Date(state.startedAt).getTime()) / 1000;
}
