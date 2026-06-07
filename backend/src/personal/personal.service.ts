import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeService } from '../youtube/youtube.service';

@Injectable()
export class PersonalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly youtubeService: YoutubeService
  ) {}

  async history(userId: number) {
    const items = await this.prisma.personalHistory.findMany({
      orderBy: { playedAt: 'desc' },
      take: 50,
      where: { userId: BigInt(userId) }
    });

    return items.map((item) => ({
      id: Number(item.id),
      userId: Number(item.userId),
      videoId: item.videoId,
      title: item.title,
      channelTitle: item.channelTitle,
      thumbnailUrl: item.thumbnailUrl,
      playedAt: item.playedAt.toISOString()
    }));
  }

  async addHistory(userId: number, videoId: string) {
    const video = await this.youtubeService.getVideo(videoId);
    const item = await this.prisma.personalHistory.create({
      data: {
        userId: BigInt(userId),
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl
      }
    });

    return {
      id: Number(item.id),
      videoId: item.videoId,
      title: item.title,
      channelTitle: item.channelTitle,
      thumbnailUrl: item.thumbnailUrl,
      playedAt: item.playedAt.toISOString()
    };
  }

  async clearHistory(userId: number) {
    await this.prisma.personalHistory.deleteMany({
      where: { userId: BigInt(userId) }
    });

    return { ok: true };
  }

  async favorites(userId: number) {
    const items = await this.prisma.favorite.findMany({
      orderBy: { createdAt: 'desc' },
      where: { userId: BigInt(userId) }
    });

    return items.map((item) => ({
      id: Number(item.id),
      userId: Number(item.userId),
      videoId: item.videoId,
      title: item.title,
      channelTitle: item.channelTitle,
      thumbnailUrl: item.thumbnailUrl,
      createdAt: item.createdAt.toISOString()
    }));
  }

  async addFavorite(userId: number, videoId: string) {
    const video = await this.youtubeService.getVideo(videoId);
    const item = await this.prisma.favorite.upsert({
      create: {
        userId: BigInt(userId),
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl
      },
      update: {
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl
      },
      where: {
        userId_videoId: {
          userId: BigInt(userId),
          videoId: video.videoId
        }
      }
    });

    return {
      id: Number(item.id),
      videoId: item.videoId,
      title: item.title,
      channelTitle: item.channelTitle,
      thumbnailUrl: item.thumbnailUrl,
      createdAt: item.createdAt.toISOString()
    };
  }

  async removeFavorite(userId: number, videoId: string) {
    await this.prisma.favorite.deleteMany({
      where: {
        userId: BigInt(userId),
        videoId
      }
    });

    return { ok: true };
  }
}
