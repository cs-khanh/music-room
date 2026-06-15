import { IsInt, Min } from 'class-validator';

export class KickMemberDto {
  @IsInt()
  @Min(1)
  userId: number;
}
