import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PlayerSyncModule } from './player-sync/player-sync.module';
import { PersonalModule } from './personal/personal.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RoomsModule } from './rooms/rooms.module';
import { UsersModule } from './users/users.module';
import { WebsocketModule } from './websocket/websocket.module';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', 'backend/.env'],
      isGlobal: true
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    YoutubeModule,
    RoomsModule,
    QueueModule,
    PlayerSyncModule,
    PersonalModule,
    WebsocketModule
  ]
})
export class AppModule {}
