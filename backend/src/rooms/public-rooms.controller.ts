import { Controller, Get } from '@nestjs/common';
import { RoomsService } from './rooms.service';

@Controller('public')
export class PublicRoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('rooms')
  list() {
    return this.roomsService.publicRooms();
  }
}
