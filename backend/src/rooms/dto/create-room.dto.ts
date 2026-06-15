import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'Room code can only contain letters, numbers, and hyphens.'
  })
  code?: string;

  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;

  @IsBoolean()
  @IsOptional()
  allowMemberAddSong?: boolean;
}
