import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../common/auth/authenticated-request';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { AddQueueItemDto } from './dto/add-queue-item.dto';
import { ReorderQueueDto } from './dto/reorder-queue.dto';
import { QueueService } from './queue.service';

@Controller('rooms/:code/queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get()
  list(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.list(code, user.id);
  }

  @Post()
  add(@Param('code') code: string, @Body() dto: AddQueueItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.add(code, dto, user.id);
  }

  @Delete(':queueId')
  remove(@Param('code') code: string, @Param('queueId') queueId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.remove(code, Number(queueId), user.id);
  }

  @Patch('reorder')
  reorder(@Param('code') code: string, @Body() dto: ReorderQueueDto, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.reorder(code, dto, user.id);
  }

  @Post('next')
  next(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.next(code, user.id);
  }

  @Post(':queueId/play-now')
  playNow(@Param('code') code: string, @Param('queueId') queueId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queueService.playNow(code, Number(queueId), user.id);
  }
}
