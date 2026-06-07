import { apiClient } from '@/lib/api-client';

export type PersonalHistoryItem = {
  id: number;
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  playedAt: string;
};

export type FavoriteItem = {
  id: number;
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
};

export const personalService = {
  history() {
    return apiClient<PersonalHistoryItem[]>('/me/history');
  },

  addHistory(videoId: string) {
    return apiClient<PersonalHistoryItem>('/me/history', {
      body: { videoId },
      method: 'POST'
    });
  },

  clearHistory() {
    return apiClient<{ ok: boolean }>('/me/history', {
      method: 'DELETE'
    });
  },

  favorites() {
    return apiClient<FavoriteItem[]>('/me/favorites');
  },

  addFavorite(videoId: string) {
    return apiClient<FavoriteItem>('/me/favorites', {
      body: { videoId },
      method: 'POST'
    });
  },

  removeFavorite(videoId: string) {
    return apiClient<{ ok: boolean }>(`/me/favorites/${videoId}`, {
      method: 'DELETE'
    });
  }
};
