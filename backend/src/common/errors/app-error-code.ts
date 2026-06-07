export const AppErrorCode = {
  AuthRequired: 'AUTH_REQUIRED',
  RoomNotFound: 'ROOM_NOT_FOUND',
  RoomAccessDenied: 'ROOM_ACCESS_DENIED',
  UserNotRoomMember: 'USER_NOT_ROOM_MEMBER',
  OnlyOwnerCanControlPlayer: 'ONLY_OWNER_CAN_CONTROL_PLAYER',
  OnlyOwnerCanReorderQueue: 'ONLY_OWNER_CAN_REORDER_QUEUE',
  OnlyOwnerCanTransferOwnership: 'ONLY_OWNER_CAN_TRANSFER_OWNERSHIP',
  MemberCannotSeek: 'MEMBER_CANNOT_SEEK',
  QueueItemNotFound: 'QUEUE_ITEM_NOT_FOUND',
  NoNextSong: 'NO_NEXT_SONG',
  YouTubeVideoNotEmbeddable: 'YOUTUBE_VIDEO_NOT_EMBEDDABLE',
  YouTubeApiQuotaExceeded: 'YOUTUBE_API_QUOTA_EXCEEDED'
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];
