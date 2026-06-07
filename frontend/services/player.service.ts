import type { RoomPlayerState, RoomQueueItem } from '@music-room/shared';
import { apiClient } from '@/lib/api-client';

export const playerService = {
  state(roomCode: string) {
    return apiClient<RoomPlayerState>(`/rooms/${roomCode}/player-state`);
  },

  play(roomCode: string, currentTime: number) {
    return apiClient<RoomPlayerState>(`/rooms/${roomCode}/player/play`, {
      body: { currentTime },
      method: 'POST'
    });
  },

  pause(roomCode: string, currentTime: number) {
    return apiClient<RoomPlayerState>(`/rooms/${roomCode}/player/pause`, {
      body: { currentTime },
      method: 'POST'
    });
  },

  seek(roomCode: string, currentTime: number) {
    return apiClient<RoomPlayerState>(`/rooms/${roomCode}/player/seek`, {
      body: { currentTime },
      method: 'POST'
    });
  },

  sync(roomCode: string) {
    return apiClient<RoomPlayerState>(`/rooms/${roomCode}/player/sync`, {
      method: 'POST'
    });
  },

  forceSync(roomCode: string) {
    return apiClient<RoomPlayerState>(`/rooms/${roomCode}/player/force-sync`, {
      method: 'POST'
    });
  },

  ended(roomCode: string) {
    return apiClient<{ state: RoomPlayerState; queue: RoomQueueItem[] }>(`/rooms/${roomCode}/player/ended`, {
      method: 'POST'
    });
  }
};
