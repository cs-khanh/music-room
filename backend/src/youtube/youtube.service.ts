import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { YouTubeSearchResponse, YouTubeVideo } from '@music-room/shared';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class YoutubeService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async search(query: string): Promise<YouTubeSearchResponse> {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery || normalizedQuery.length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters.');
    }

    const queryHash = createHash('sha256').update(normalizedQuery.toLowerCase()).digest('hex');
    const cached = await this.prisma.youtubeSearchCache.findUnique({
      where: { queryHash }
    });

    if (cached && cached.expiresAt > new Date()) {
      return cached.resultJson as YouTubeSearchResponse;
    }

    const apiKey = this.getApiKey();
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', '8');
    searchUrl.searchParams.set('q', normalizedQuery);
    searchUrl.searchParams.set('key', apiKey);

    const searchData = await this.fetchJson<YouTubeSearchApiResponse>(searchUrl);
    const videoIds = searchData.items.map((item) => item.id.videoId).filter(Boolean);
    const videos = await this.getVideos(videoIds);
    const response: YouTubeSearchResponse = {
      items: videos,
      nextPageToken: searchData.nextPageToken
    };

    await this.prisma.youtubeSearchCache.upsert({
      create: {
        queryHash,
        queryText: normalizedQuery,
        resultJson: response,
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000)
      },
      update: {
        queryText: normalizedQuery,
        resultJson: response,
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000)
      },
      where: { queryHash }
    });

    return response;
  }

  async getVideo(videoId: string): Promise<YouTubeVideo> {
    if (!videoId) {
      throw new BadRequestException('videoId is required.');
    }

    const [video] = await this.getVideos([videoId]);
    if (!video) {
      throw new BadRequestException('YouTube video was not found.');
    }

    return video;
  }

  private getApiKey() {
    const apiKey = this.config.getOrThrow<string>('YOUTUBE_API_KEY');
    if (apiKey === 'paste-your-youtube-data-api-v3-key-here' || apiKey === 'change-me') {
      throw new ServiceUnavailableException('YOUTUBE_API_KEY is not configured.');
    }

    return apiKey;
  }

  private async getVideos(videoIds: string[]): Promise<YouTubeVideo[]> {
    if (videoIds.length === 0) {
      return [];
    }

    const uniqueVideoIds = [...new Set(videoIds)];
    const cached = await this.prisma.youtubeVideoCache.findMany({
      where: { videoId: { in: uniqueVideoIds } }
    });

    const cachedById = new Map(
      cached.map((item) => [
        item.videoId,
        {
          videoId: item.videoId,
          title: item.title,
          channelTitle: item.channelTitle ?? '',
          thumbnailUrl: item.thumbnailUrl ?? '',
          durationSeconds: item.durationSeconds,
          embeddable: item.embeddable
        } satisfies YouTubeVideo
      ])
    );

    const missingIds = uniqueVideoIds.filter((id) => !cachedById.has(id));
    if (missingIds.length > 0) {
      const apiKey = this.getApiKey();
      const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      videosUrl.searchParams.set('part', 'snippet,contentDetails,status');
      videosUrl.searchParams.set('id', missingIds.join(','));
      videosUrl.searchParams.set('key', apiKey);

      const videosData = await this.fetchJson<YouTubeVideosApiResponse>(videosUrl);
      for (const item of videosData.items) {
        const thumbnail =
          item.snippet.thumbnails.maxres?.url ??
          item.snippet.thumbnails.high?.url ??
          item.snippet.thumbnails.medium?.url ??
          item.snippet.thumbnails.default?.url ??
          '';
        const video: YouTubeVideo = {
          videoId: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnailUrl: thumbnail,
          durationSeconds: parseYouTubeDuration(item.contentDetails.duration),
          embeddable: item.status.embeddable
        };

        cachedById.set(item.id, video);
        await this.prisma.youtubeVideoCache.upsert({
          create: {
            videoId: video.videoId,
            title: video.title,
            channelTitle: video.channelTitle,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds,
            embeddable: video.embeddable,
            rawJson: item
          },
          update: {
            title: video.title,
            channelTitle: video.channelTitle,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds,
            embeddable: video.embeddable,
            rawJson: item
          },
          where: { videoId: video.videoId }
        });
      }
    }

    return videoIds.map((id) => cachedById.get(id)).filter((video): video is YouTubeVideo => Boolean(video));
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new ServiceUnavailableException(`YouTube API request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}

function parseYouTubeDuration(duration: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

type YouTubeSearchApiResponse = {
  nextPageToken?: string;
  items: Array<{
    id: {
      videoId: string;
    };
  }>;
};

type YouTubeVideosApiResponse = {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails: Record<string, { url: string } | undefined>;
    };
    contentDetails: {
      duration: string;
    };
    status: {
      embeddable: boolean;
    };
  }>;
};
