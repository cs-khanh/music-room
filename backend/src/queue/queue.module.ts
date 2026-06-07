import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

@Module({
  controllers: [QueueController],
  exports: [QueueService],
  imports: [AuthModule, RoomsModule, YoutubeModule],
  providers: [QueueService]
})
export class QueueModule {}
