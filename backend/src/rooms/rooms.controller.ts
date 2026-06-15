import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../common/auth/authenticated-request';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { AssignOwnerDto } from './dto/assign-owner.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { KickMemberDto } from './dto/kick-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.create(dto, user.id);
  }

  @Get('me')
  myRooms(@CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.myRooms(user.id);
  }

  @Get(':code')
  findByCode(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.findByCode(code, user.id);
  }

  @Patch(':code')
  update(@Param('code') code: string, @Body() dto: UpdateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.update(code, dto, user.id);
  }

  @Delete(':code')
  delete(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.delete(code, user.id);
  }

  @Post(':code/join')
  join(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.join(code, user.id);
  }

  @Post(':code/leave')
  leave(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.leave(code, user.id);
  }

  @Get(':code/members')
  members(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.members(code, user.id);
  }

  @Post(':code/owner/assign')
  assignOwner(@Param('code') code: string, @Body() dto: AssignOwnerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.assignOwner(code, dto.userId, user.id);
  }

  @Post(':code/owner/demote')
  demoteOwner(@Param('code') code: string, @Body() dto: AssignOwnerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.demoteOwner(code, dto.userId, user.id);
  }

  @Post(':code/members/kick')
  kickMember(@Param('code') code: string, @Body() dto: KickMemberDto, @CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.kickMember(code, dto.userId, user.id);
  }
}
