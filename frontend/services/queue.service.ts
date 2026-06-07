import type { RoomPlayerState, RoomQueueItem } from '@music-room/shared';
import { apiClient } from '@/lib/api-client';

export const queueService = {
  list(roomCode: string) {
    return apiClient<RoomQueueItem[]>(`/rooms/${roomCode}/queue`);
  },

  add(roomCode: string, videoId: string) {
    return apiClient<RoomQueueItem>(`/rooms/${roomCode}/queue`, {
      body: { videoId },
      method: 'POST'
    });
  },

  remove(roomCode: string, queueId: number) {
    return apiClient<{ ok: boolean }>(`/rooms/${roomCode}/queue/${queueId}`, {
      method: 'DELETE'
    });
  },

  reorder(roomCode: string, queueItemIds: number[]) {
    return apiClient<RoomQueueItem[]>(`/rooms/${roomCode}/queue/reorder`, {
      body: { queueItemIds },
      method: 'PATCH'
    });
  },

  next(roomCode: string) {
    return apiClient<{ state: RoomPlayerState; queue: RoomQueueItem[] }>(`/rooms/${roomCode}/queue/next`, {
      method: 'POST'
    });
  },

  playNow(roomCode: string, queueId: number) {
    return apiClient<{ state: RoomPlayerState; queue: RoomQueueItem[] }>(`/rooms/${roomCode}/queue/${queueId}/play-now`, {
      method: 'POST'
    });
  }
};
