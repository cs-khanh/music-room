import { Controller, Get, Param, Query } from '@nestjs/common';
import { YoutubeService } from './youtube.service';

@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get('search')
  search(@Query('q') query: string) {
    return this.youtubeService.search(query);
  }

  @Get('videos/:videoId')
  getVideo(@Param('videoId') videoId: string) {
    return this.youtubeService.getVideo(videoId);
  }
}
