import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddQueueItemDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  videoId: string;
}
