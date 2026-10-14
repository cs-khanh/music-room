import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('listeners')
  async listeners() {
    const members = await this.prisma.roomMember.findMany({
      distinct: ['userId'],
      select: { userId: true },
      where: {
        isOnline: true,
        room: { playerStatus: 'playing' }
      }
    });

    return { listeners: members.length };
  }
}
