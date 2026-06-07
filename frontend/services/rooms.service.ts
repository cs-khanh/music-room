import type { MyRooms, Room, RoomMember } from '@music-room/shared';
import { apiClient } from '@/lib/api-client';

export const roomsService = {
  create(payload: { name: string; isPrivate?: boolean; allowMemberAddSong?: boolean }) {
    return apiClient<Room>('/rooms', {
      body: payload,
      method: 'POST'
    });
  },

  get(code: string) {
    return apiClient<Room>(`/rooms/${code}`);
  },

  myRooms() {
    return apiClient<MyRooms>('/rooms/me');
  },

  update(
    code: string,
    payload: {
      name?: string;
      isPrivate?: boolean;
      allowMemberAddSong?: boolean;
      allowMemberRemoveOwnSong?: boolean;
    }
  ) {
    return apiClient<Room>(`/rooms/${code}`, {
      body: payload,
      method: 'PATCH'
    });
  },

  delete(code: string) {
    return apiClient<{ ok: boolean }>(`/rooms/${code}`, {
      method: 'DELETE'
    });
  },

  join(code: string) {
    return apiClient<Room>(`/rooms/${code}/join`, {
      method: 'POST'
    });
  },

  leave(code: string) {
    return apiClient<{ ok: boolean }>(`/rooms/${code}/leave`, {
      method: 'POST'
    });
  },

  members(code: string) {
    return apiClient<RoomMember[]>(`/rooms/${code}/members`);
  },

  assignOwner(code: string, userId: number) {
    return apiClient<Room>(`/rooms/${code}/owner/assign`, {
      body: { userId },
      method: 'POST'
    });
  }
};
