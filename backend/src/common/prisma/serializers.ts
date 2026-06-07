import type { Room, RoomMember, RoomQueueItem, User } from '@prisma/client';
import type { RoomPlayerState, RoomQueueItem as SharedQueueItem, RoomMember as SharedRoomMember } from '@music-room/shared';

type RoomWithCurrentQueueItem = Room & {
  currentQueueItem?: RoomQueueItem | null;
};

type MemberWithUser = RoomMember & {
  user: Pick<User, 'username' | 'avatarUrl'>;
};

export function serializeQueueItem(item: RoomQueueItem): SharedQueueItem {
  return {
    id: Number(item.id),
    roomId: Number(item.roomId),
    videoId: item.videoId,
    title: item.title,
    channelTitle: item.channelTitle,
    thumbnailUrl: item.thumbnailUrl,
    durationSeconds: item.durationSeconds,
    addedBy: Number(item.addedBy),
    position: item.position,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

export function serializeRoomMember(member: MemberWithUser): SharedRoomMember {
  return {
    id: Number(member.id),
    roomId: Number(member.roomId),
    userId: Number(member.userId),
    username: member.user.username,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    isOnline: member.isOnline,
    joinedAt: member.joinedAt.toISOString(),
    lastSeenAt: member.lastSeenAt?.toISOString() ?? null
  };
}

export function serializePlayerState(room: RoomWithCurrentQueueItem): RoomPlayerState {
  return {
    roomId: Number(room.id),
    currentVideoId: room.currentVideoId,
    currentQueueItemId: room.currentQueueItemId === null ? null : Number(room.currentQueueItemId),
    currentQueueItem: room.currentQueueItem ? serializeQueueItem(room.currentQueueItem) : null,
    status: room.playerStatus,
    currentTime: room.currentTime,
    startedAt: room.startedAt?.toISOString() ?? null,
    updatedBy: Number(room.ownerId)
  };
}
