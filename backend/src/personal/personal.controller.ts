import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../common/auth/authenticated-request';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { VideoIdDto } from './dto/video-id.dto';
import { PersonalService } from './personal.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.personalService.history(user.id);
  }

  @Post('history')
  addHistory(@CurrentUser() user: AuthenticatedUser, @Body() dto: VideoIdDto) {
    return this.personalService.addHistory(user.id, dto.videoId);
  }

  @Delete('history')
  clearHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.personalService.clearHistory(user.id);
  }

  @Get('favorites')
  favorites(@CurrentUser() user: AuthenticatedUser) {
    return this.personalService.favorites(user.id);
  }

  @Post('favorites')
  addFavorite(@CurrentUser() user: AuthenticatedUser, @Body() dto: VideoIdDto) {
    return this.personalService.addFavorite(user.id, dto.videoId);
  }

  @Delete('favorites/:videoId')
  removeFavorite(@CurrentUser() user: AuthenticatedUser, @Param('videoId') videoId: string) {
    return this.personalService.removeFavorite(user.id, videoId);
  }
}
