import { IsString, MaxLength, MinLength } from 'class-validator';

export class VideoIdDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  videoId: string;
}
