import type { RoomPlayerState } from './player';
import type { RoomQueueItem } from './queue';

export type RoomRole = 'owner' | 'member';

export type RoomMember = {
  id: number;
  roomId: number;
  userId: number;
  username: string;
  avatarUrl: string | null;
  role: RoomRole;
  isOnline: boolean;
  joinedAt: string;
  lastSeenAt: string | null;
};

export type Room = {
  id: number;
  code: string;
  name: string;
  ownerId: number;
  isPrivate: boolean;
  allowMemberAddSong: boolean;
  allowMemberRemoveOwnSong: boolean;
  playerState: RoomPlayerState;
  members: RoomMember[];
  queue: RoomQueueItem[];
};

export type RoomListItem = {
  id: number;
  code: string;
  name: string;
  ownerId: number;
  isPrivate: boolean;
  playerStatus: RoomPlayerState['status'];
  currentVideoId: string | null;
  currentTitle: string | null;
  memberCount: number;
  onlineMemberCount: number;
  createdAt: string;
  updatedAt: string;
  joinedAt: string | null;
  lastSeenAt: string | null;
};

export type MyRooms = {
  owned: RoomListItem[];
  recentJoined: RoomListItem[];
};
