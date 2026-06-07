import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlayerSyncModule } from '../player-sync/player-sync.module';
import { QueueModule } from '../queue/queue.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomGateway } from './room.gateway';

@Module({
  imports: [AuthModule, RoomsModule, QueueModule, PlayerSyncModule],
  providers: [RoomGateway]
})
export class WebsocketModule {}
