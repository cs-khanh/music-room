export type QueueItemStatus = 'queued' | 'playing' | 'played' | 'removed';

export type RoomQueueItem = {
  id: number;
  roomId: number;
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  addedBy: number;
  position: number;
  status: QueueItemStatus;
  createdAt: string;
  updatedAt: string;
};
