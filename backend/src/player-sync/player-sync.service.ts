import { Injectable } from '@nestjs/common';
import { getRealCurrentTime } from '@music-room/shared';
import { serializePlayerState, serializeQueueItem } from '../common/prisma/serializers';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';

@Injectable()
export class PlayerSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsService: RoomsService
  ) {}

  async getState(roomCode: string, userId: number) {
    await this.roomsService.requireMember(roomCode, userId);
    const room = await this.prisma.room.findUniqueOrThrow({
      include: { currentQueueItem: true },
      where: { code: roomCode }
    });
    return this.stateWithRealTime(room);
  }

  async play(roomCode: string, currentTime: number, userId: number) {
    const room = await this.roomsService.requireOwner(roomCode, userId);
    const playableRoom = await this.ensureCurrentSong(room.id);

    const updated = await this.prisma.room.update({
      data: {
        currentTime,
        playerStatus: 'playing',
        startedAt: new Date()
      },
      where: { id: playableRoom.id }
    });

    return this.stateWithCurrentItem(updated.id);
  }

  async pause(roomCode: string, currentTime: number, userId: number) {
    const room = await this.roomsService.requireOwner(roomCode, userId);
    const updated = await this.prisma.room.update({
      data: {
        currentTime,
        playerStatus: 'paused',
        startedAt: null
      },
      where: { id: room.id }
    });

    return this.stateWithCurrentItem(updated.id);
  }

  async seek(roomCode: string, currentTime: number, userId: number) {
    const room = await this.roomsService.requireOwner(roomCode, userId);
    const updated = await this.prisma.room.update({
      data: {
        currentTime,
        startedAt: room.playerStatus === 'playing' ? new Date() : room.startedAt
      },
      where: { id: room.id }
    });

    return this.stateWithCurrentItem(updated.id);
  }

  async sync(roomCode: string, userId: number) {
    await this.roomsService.requireMember(roomCode, userId);
    const room = await this.prisma.room.findUniqueOrThrow({
      include: { currentQueueItem: true },
      where: { code: roomCode }
    });
    return this.stateWithRealTime(room);
  }

  async forceSync(roomCode: string, userId: number) {
    const room = await this.roomsService.requireOwner(roomCode, userId);
    return this.stateWithCurrentItem(room.id);
  }

  async ended(roomCode: string, userId: number) {
    const room = await this.roomsService.requireOwner(roomCode, userId);

    const updatedRoom = await this.prisma.$transaction(async (tx) => {
      if (room.currentQueueItemId) {
        await tx.roomQueueItem.update({
          data: { status: 'played' },
          where: { id: room.currentQueueItemId }
        });
      }

      const nextItem = await tx.roomQueueItem.findFirst({
        orderBy: { position: 'asc' },
        where: {
          roomId: room.id,
          status: 'queued'
        }
      });

      if (!nextItem) {
        return tx.room.update({
          data: {
            currentQueueItemId: null,
            currentVideoId: null,
            currentTime: 0,
            playerStatus: 'idle',
            startedAt: null
          },
          where: { id: room.id }
        });
      }

      await tx.roomQueueItem.update({
        data: { status: 'playing' },
        where: { id: nextItem.id }
      });

      return tx.room.update({
        data: {
          currentQueueItemId: nextItem.id,
          currentVideoId: nextItem.videoId,
          currentTime: 0,
          playerStatus: 'playing',
          startedAt: new Date()
        },
        where: { id: room.id }
      });
    });

    const queue = await this.prisma.roomQueueItem.findMany({
      orderBy: { position: 'asc' },
      where: {
        roomId: room.id,
        status: 'queued'
      }
    });

    return {
      state: await this.stateWithCurrentItem(updatedRoom.id),
      queue: queue.map(serializeQueueItem)
    };
  }

  private async ensureCurrentSong(roomId: bigint) {
    const room = await this.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    if (room.currentVideoId) {
      return room;
    }

    const firstQueued = await this.prisma.roomQueueItem.findFirst({
      orderBy: { position: 'asc' },
      where: {
        roomId,
        status: 'queued'
      }
    });

    if (!firstQueued) {
      return room;
    }

    await this.prisma.roomQueueItem.update({
      data: { status: 'playing' },
      where: { id: firstQueued.id }
    });

    return this.prisma.room.update({
      data: {
        currentQueueItemId: firstQueued.id,
        currentVideoId: firstQueued.videoId,
        currentTime: 0
      },
      where: { id: roomId }
    });
  }

  private async stateWithCurrentItem(roomId: bigint) {
    const room = await this.prisma.room.findUniqueOrThrow({
      include: { currentQueueItem: true },
      where: { id: roomId }
    });
    return this.stateWithRealTime(room);
  }

  private stateWithRealTime(room: Parameters<typeof serializePlayerState>[0]) {
    const state = serializePlayerState(room);
    return {
      ...state,
      currentTime: getRealCurrentTime(state)
    };
  }
}
