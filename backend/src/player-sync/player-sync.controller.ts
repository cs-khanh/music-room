import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../common/auth/authenticated-request';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PlayerTimeDto } from './dto/player-time.dto';
import { PlayerSyncService } from './player-sync.service';

@Controller('rooms/:code')
@UseGuards(JwtAuthGuard)
export class PlayerSyncController {
  constructor(private readonly playerSyncService: PlayerSyncService) {}

  @Get('player-state')
  getState(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.playerSyncService.getState(code, user.id);
  }

  @Post('player/play')
  play(@Param('code') code: string, @Body() dto: PlayerTimeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.playerSyncService.play(code, dto.currentTime, user.id);
  }

  @Post('player/pause')
  pause(@Param('code') code: string, @Body() dto: PlayerTimeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.playerSyncService.pause(code, dto.currentTime, user.id);
  }

  @Post('player/seek')
  seek(@Param('code') code: string, @Body() dto: PlayerTimeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.playerSyncService.seek(code, dto.currentTime, user.id);
  }

  @Post('player/sync')
  sync(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.playerSyncService.sync(code, user.id);
  }

  @Post('player/force-sync')
  forceSync(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.playerSyncService.forceSync(code, user.id);
  }

  @Post('player/ended')
  ended(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.playerSyncService.ended(code, user.id);
  }
}
