import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  exports: [RoomsService],
  imports: [AuthModule],
  providers: [RoomsService]
})
export class RoomsModule {}
