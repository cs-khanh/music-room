import type { YouTubeVideo } from '@music-room/shared';
import { create } from 'zustand';

type PersonalQueueState = {
  queue: YouTubeVideo[];
  addSong: (song: YouTubeVideo) => void;
  removeSong: (videoId: string) => void;
  clearQueue: () => void;
};

export const usePersonalQueueStore = create<PersonalQueueState>((set) => ({
  queue: [],
  addSong: (song) => set((state) => ({ queue: [...state.queue, song] })),
  removeSong: (videoId) => set((state) => ({ queue: state.queue.filter((song) => song.videoId !== videoId) })),
  clearQueue: () => set({ queue: [] })
}));
