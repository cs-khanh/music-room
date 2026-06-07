import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { PlayerSyncController } from './player-sync.controller';
import { PlayerSyncService } from './player-sync.service';

@Module({
  controllers: [PlayerSyncController],
  exports: [PlayerSyncService],
  imports: [AuthModule, RoomsModule],
  providers: [PlayerSyncService]
})
export class PlayerSyncModule {}
