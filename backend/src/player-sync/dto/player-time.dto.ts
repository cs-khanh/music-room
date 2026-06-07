import { IsNumber, Min } from 'class-validator';

export class PlayerTimeDto {
  @IsNumber()
  @Min(0)
  currentTime: number;
}
