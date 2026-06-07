import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { serializePlayerState, serializeQueueItem } from '../common/prisma/serializers';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { YoutubeService } from '../youtube/youtube.service';
import { AddQueueItemDto } from './dto/add-queue-item.dto';
import { ReorderQueueDto } from './dto/reorder-queue.dto';

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsService: RoomsService,
    private readonly youtubeService: YoutubeService
  ) {}

  async list(roomCode: string, userId: number) {
    await this.roomsService.requireMember(roomCode, userId);
    const items = await this.getVisibleQueue(roomCode);
    return items.map(serializeQueueItem);
  }

  async add(roomCode: string, dto: AddQueueItemDto, userId: number) {
    const member = await this.roomsService.requireMember(roomCode, userId);
    const room = await this.prisma.room.findUniqueOrThrow({
      where: { code: roomCode }
    });

    if (member.role !== 'owner' && !room.allowMemberAddSong) {
      throw new ForbiddenException('Members are not allowed to add songs in this room.');
    }

    const video = await this.youtubeService.getVideo(dto.videoId);
    if (!video.embeddable) {
      throw new ForbiddenException('This YouTube video cannot be embedded.');
    }

    const maxPosition = await this.prisma.roomQueueItem.aggregate({
      _max: { position: true },
      where: { roomId: room.id }
    });

    const item = await this.prisma.roomQueueItem.create({
      data: {
        roomId: room.id,
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        addedBy: BigInt(userId),
        position: (maxPosition._max.position ?? 0) + 1,
        status: 'queued'
      }
    });

    return serializeQueueItem(item);
  }

  async remove(roomCode: string, queueId: number, userId: number) {
    const member = await this.roomsService.requireMember(roomCode, userId);
    const item = await this.prisma.roomQueueItem.findFirst({
      include: { room: true },
      where: {
        id: BigInt(queueId),
        room: { code: roomCode },
        status: { not: 'removed' }
      }
    });

    if (!item) {
      throw new NotFoundException('Queue item not found.');
    }

    const isOwner = member.role === 'owner';
    const isOwnSong = item.addedBy === BigInt(userId);
    if (!isOwner && !(isOwnSong && item.room.allowMemberRemoveOwnSong)) {
      throw new ForbiddenException('Only the owner can remove this song.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.roomQueueItem.update({
        data: { status: 'removed' },
        where: { id: item.id }
      });

      if (item.room.currentQueueItemId === item.id) {
        await tx.room.update({
          data: {
            currentQueueItemId: null,
            currentVideoId: null,
            currentTime: 0,
            playerStatus: 'idle',
            startedAt: null
          },
          where: { id: item.roomId }
        });
      }
    });

    return { ok: true };
  }

  async reorder(roomCode: string, dto: ReorderQueueDto, userId: number) {
    const room = await this.roomsService.requireOwner(roomCode, userId);
    const queuedItems = await this.prisma.roomQueueItem.findMany({
      orderBy: { position: 'asc' },
      where: {
        roomId: room.id,
        status: 'queued'
      }
    });

    const currentIds = queuedItems.map((item) => Number(item.id)).sort((a, b) => a - b);
    const payloadIds = [...dto.queueItemIds].sort((a, b) => a - b);
    const hasSameItems = currentIds.length === payloadIds.length && currentIds.every((id, index) => id === payloadIds[index]);

    if (!hasSameItems) {
      throw new ForbiddenException('Queue reorder payload must contain every queued item exactly once.');
    }

    await this.prisma.$transaction(
      dto.queueItemIds.map((id, index) =>
        this.prisma.roomQueueItem.update({
          data: { position: index + 1 },
          where: { id: BigInt(id) }
        })
      )
    );

    return this.list(roomCode, userId);
  }

  async next(roomCode: string, userId: number) {
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

    const queue = await this.list(roomCode, userId);
    return {
      state: serializePlayerState(updatedRoom),
      queue
    };
  }

  async playNow(roomCode: string, queueId: number, userId: number) {
    const room = await this.roomsService.requireOwner(roomCode, userId);
    const targetItem = await this.prisma.roomQueueItem.findFirst({
      where: {
        id: BigInt(queueId),
        roomId: room.id,
        status: 'queued'
      }
    });

    if (!targetItem) {
      throw new NotFoundException('Queue item not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      if (room.currentQueueItemId) {
        await tx.roomQueueItem.update({
          data: { status: 'played' },
          where: { id: room.currentQueueItemId }
        });
      }

      await tx.roomQueueItem.update({
        data: { status: 'playing' },
        where: { id: targetItem.id }
      });

      await tx.room.update({
        data: {
          currentQueueItemId: targetItem.id,
          currentVideoId: targetItem.videoId,
          currentTime: 0,
          playerStatus: 'playing',
          startedAt: new Date()
        },
        where: { id: room.id }
      });
    });

    const [updatedRoom, queue] = await Promise.all([
      this.prisma.room.findUniqueOrThrow({
        include: { currentQueueItem: true },
        where: { id: room.id }
      }),
      this.list(roomCode, userId)
    ]);

    return {
      state: serializePlayerState(updatedRoom),
      queue
    };
  }

  private getVisibleQueue(roomCode: string) {
    return this.prisma.roomQueueItem.findMany({
      orderBy: { position: 'asc' },
      where: {
        room: { code: roomCode },
        status: 'queued'
      }
    });
  }
}
