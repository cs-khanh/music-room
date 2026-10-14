import type { YouTubeSearchResponse, YouTubeVideo } from '@music-room/shared';
import { apiClient } from '@/lib/api-client';

export const youtubeService = {
  search(query: string) {
    return apiClient<YouTubeSearchResponse>('/youtube/search', {
      params: { q: query }
    });
  },

  trending(region: 'VN' | 'US' | 'GB') {
    return apiClient<YouTubeSearchResponse>('/youtube/trending', {
      params: { region }
    });
  },

  getVideo(videoId: string) {
    return apiClient<YouTubeVideo>(`/youtube/videos/${videoId}`);
  }
};
