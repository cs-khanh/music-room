import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getRealCurrentTime, type MyRooms } from '@music-room/shared';
import { serializePlayerState, serializeQueueItem, serializeRoomMember } from '../common/prisma/serializers';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRoomDto, userId: number) {
    const code = await this.generateRoomCode();
    const room = await this.prisma.room.create({
      data: {
        code,
        name: dto.name,
        ownerId: BigInt(userId),
        isPrivate: dto.isPrivate ?? false,
        allowMemberAddSong: dto.allowMemberAddSong ?? true,
        members: {
          create: {
            userId: BigInt(userId),
            role: 'owner',
            isOnline: true
          }
        }
      }
    });

    return this.findByCode(room.code, userId);
  }

  async findByCode(code: string, userId: number) {
    await this.requireMember(code, userId);
    const room = await this.findRoomPayload(code);
    return this.serializeRoom(room);
  }

  async snapshot(code: string, userId: number) {
    return this.findByCode(code, userId);
  }

  async myRooms(userId: number): Promise<MyRooms> {
    const [owned, joined] = await Promise.all([
      this.prisma.room.findMany({
        include: {
          currentQueueItem: true,
          members: { select: { isOnline: true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        where: { ownerId: BigInt(userId) }
      }),
      this.prisma.roomMember.findMany({
        include: {
          room: {
            include: {
              currentQueueItem: true,
              members: { select: { isOnline: true } }
            }
          }
        },
        orderBy: [{ lastSeenAt: 'desc' }, { joinedAt: 'desc' }],
        take: 20,
        where: {
          role: 'member',
          userId: BigInt(userId)
        }
      })
    ]);

    return {
      owned: owned.map((room) => this.serializeRoomListItem(room, null)),
      recentJoined: joined.map((member) => this.serializeRoomListItem(member.room, member))
    };
  }

  async update(code: string, dto: UpdateRoomDto, userId: number) {
    const room = await this.requireOwner(code, userId);
    await this.prisma.room.update({
      data: {
        name: dto.name,
        isPrivate: dto.isPrivate,
        allowMemberAddSong: dto.allowMemberAddSong,
        allowMemberRemoveOwnSong: dto.allowMemberRemoveOwnSong
      },
      where: { id: room.id }
    });

    return this.findByCode(code, userId);
  }

  async delete(code: string, userId: number) {
    const room = await this.requireOwner(code, userId);
    await this.prisma.$transaction([
      this.prisma.room.update({
        data: { currentQueueItemId: null },
        where: { id: room.id }
      }),
      this.prisma.roomQueueItem.deleteMany({ where: { roomId: room.id } }),
      this.prisma.roomMember.deleteMany({ where: { roomId: room.id } }),
      this.prisma.room.delete({ where: { id: room.id } })
    ]);

    return { ok: true };
  }

  async join(code: string, userId: number) {
    const room = await this.prisma.room.findUnique({ where: { code } });
    if (!room) {
      throw new NotFoundException('Room not found.');
    }

    await this.prisma.roomMember.upsert({
      create: {
        roomId: room.id,
        userId: BigInt(userId),
        role: room.ownerId === BigInt(userId) ? 'owner' : 'member',
        isOnline: true,
        lastSeenAt: new Date()
      },
      update: {
        isOnline: true,
        lastSeenAt: new Date()
      },
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: BigInt(userId)
        }
      }
    });

    return this.findByCode(code, userId);
  }

  async leave(code: string, userId: number) {
    const member = await this.requireMember(code, userId);
    await this.prisma.roomMember.update({
      data: {
        isOnline: false,
        lastSeenAt: new Date()
      },
      where: { id: member.id }
    });

    return { ok: true };
  }

  async members(code: string, userId: number) {
    await this.requireMember(code, userId);
    const members = await this.prisma.roomMember.findMany({
      include: { user: { select: { username: true, avatarUrl: true } } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      where: { room: { code } }
    });

    return members.map(serializeRoomMember);
  }

  async assignOwner(code: string, targetUserId: number, userId: number) {
    const room = await this.requireOwner(code, userId);
    const target = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: BigInt(targetUserId)
        }
      }
    });

    if (!target) {
      throw new ForbiddenException('Target user is not a room member.');
    }

    await this.prisma.$transaction([
      this.prisma.room.update({
        data: { ownerId: BigInt(targetUserId) },
        where: { id: room.id }
      }),
      this.prisma.roomMember.updateMany({
        data: { role: 'member' },
        where: { roomId: room.id }
      }),
      this.prisma.roomMember.update({
        data: { role: 'owner' },
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: BigInt(targetUserId)
          }
        }
      })
    ]);

    return this.findByCode(code, targetUserId);
  }

  async assertOwner(roomCode: string, userId: number) {
    const room = await this.prisma.room.findUnique({
      select: { ownerId: true },
      where: { code: roomCode }
    });

    return Boolean(room && room.ownerId === BigInt(userId));
  }

  async assertMember(roomCode: string, userId: number) {
    const member = await this.prisma.roomMember.findFirst({
      select: { id: true },
      where: {
        room: { code: roomCode },
        userId: BigInt(userId)
      }
    });

    return Boolean(member);
  }

  async requireOwner(roomCode: string, userId: number) {
    const room = await this.prisma.room.findUnique({
      where: { code: roomCode }
    });

    if (!room) {
      throw new NotFoundException('Room not found.');
    }

    if (room.ownerId !== BigInt(userId)) {
      throw new ForbiddenException('Only the room owner can perform this action.');
    }

    return room;
  }

  async requireMember(roomCode: string, userId: number) {
    const member = await this.prisma.roomMember.findFirst({
      where: {
        room: { code: roomCode },
        userId: BigInt(userId)
      }
    });

    if (!member) {
      throw new ForbiddenException('User is not a room member.');
    }

    return member;
  }

  private async generateRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      const existing = await this.prisma.room.findUnique({ where: { code } });
      if (!existing) {
        return code;
      }
    }

    throw new Error('Could not generate a unique room code.');
  }

  private findRoomPayload(code: string) {
    return this.prisma.room.findUniqueOrThrow({
      include: {
        currentQueueItem: true,
        members: {
          include: { user: { select: { username: true, avatarUrl: true } } },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }]
        },
        queueItems: {
          orderBy: { position: 'asc' },
          where: { status: 'queued' }
        }
      },
      where: { code }
    });
  }

  private serializeRoom(
    room: Prisma.RoomGetPayload<{
      include: {
        currentQueueItem: true;
        members: { include: { user: { select: { username: true; avatarUrl: true } } } };
        queueItems: true;
      };
    }>
  ) {
    const playerState = serializePlayerState(room);
    return {
      id: Number(room.id),
      code: room.code,
      name: room.name,
      ownerId: Number(room.ownerId),
      isPrivate: room.isPrivate,
      allowMemberAddSong: room.allowMemberAddSong,
      allowMemberRemoveOwnSong: room.allowMemberRemoveOwnSong,
      playerState: {
        ...playerState,
        currentTime: getRealCurrentTime(playerState)
      },
      members: room.members.map(serializeRoomMember),
      queue: room.queueItems.map(serializeQueueItem)
    };
  }

  private serializeRoomListItem(
    room: Prisma.RoomGetPayload<{
      include: {
        currentQueueItem: true;
        members: { select: { isOnline: true } };
      };
    }>,
    member: { joinedAt: Date; lastSeenAt: Date | null } | null
  ) {
    return {
      id: Number(room.id),
      code: room.code,
      name: room.name,
      ownerId: Number(room.ownerId),
      isPrivate: room.isPrivate,
      playerStatus: room.playerStatus,
      currentVideoId: room.currentVideoId,
      currentTitle: room.currentQueueItem?.title ?? null,
      memberCount: room.members.length,
      onlineMemberCount: room.members.filter((roomMember) => roomMember.isOnline).length,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      joinedAt: member?.joinedAt.toISOString() ?? null,
      lastSeenAt: member?.lastSeenAt?.toISOString() ?? null
    };
  }
}
