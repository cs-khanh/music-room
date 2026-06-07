import { ArrayMinSize, IsInt } from 'class-validator';

export class ReorderQueueDto {
  @ArrayMinSize(1)
  @IsInt({ each: true })
  queueItemIds: number[];
}
