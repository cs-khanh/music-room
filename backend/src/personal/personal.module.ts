import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { PersonalController } from './personal.controller';
import { PersonalService } from './personal.service';

@Module({
  controllers: [PersonalController],
  imports: [AuthModule, YoutubeModule],
  providers: [PersonalService]
})
export class PersonalModule {}
