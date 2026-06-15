import type { ClientToServerEvents, ServerToClientEvents } from '@music-room/shared';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketServer,
  WebSocketGateway
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../common/auth/authenticated-request';
import { PlayerSyncService } from '../player-sync/player-sync.service';
import { QueueService } from '../queue/queue.service';
import { RoomsService } from '../rooms/rooms.service';

type MusicRoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type AuthenticatedSocket = MusicRoomSocket & {
  data: {
    joinedRooms?: Set<string>;
    user?: AuthenticatedUser;
  };
};

@WebSocketGateway({
  cors: {
    credentials: true,
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000'
  }
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomGateway.name);

  @WebSocketServer()
  private readonly server: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly roomsService: RoomsService,
    private readonly queueService: QueueService,
    private readonly playerSyncService: PlayerSyncService
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      client.data.user = await this.authenticate(client);
      this.logger.debug(`Socket connected: ${client.id}`);
    } catch {
      client.emit('error', {
        code: 'AUTH_REQUIRED',
        message: 'Socket authentication is required.'
      });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
    const user = client.data.user;
    const joinedRooms = [...(client.data.joinedRooms ?? new Set<string>())];
    if (!user || joinedRooms.length === 0) {
      return;
    }

    for (const roomCode of joinedRooms) {
      await this.markUserLeftRoom(roomCode, user.id);
    }
  }

  @SubscribeMessage('room:join')
  async joinRoom(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string }) {
    const user = this.getSocketUser(client);
    await this.roomsService.join(payload.roomCode, user.id);
    await client.join(payload.roomCode);
    client.data.joinedRooms ??= new Set<string>();
    client.data.joinedRooms.add(payload.roomCode);
    return this.broadcastRoomState(payload.roomCode, user.id);
  }

  @SubscribeMessage('room:leave')
  async leaveRoom(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string }) {
    const user = this.getSocketUser(client);
    await client.leave(payload.roomCode);
    client.data.joinedRooms?.delete(payload.roomCode);
    await this.markUserLeftRoom(payload.roomCode, user.id);
    return { ok: true as const };
  }

  @SubscribeMessage('room:member:promote-owner')
  async promoteOwner(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string; userId: number }) {
    const user = this.getSocketUser(client);
    await this.roomsService.assignOwner(payload.roomCode, payload.userId, user.id);
    return this.broadcastRoomState(payload.roomCode, user.id);
  }

  @SubscribeMessage('room:member:demote-owner')
  async demoteOwner(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string; userId: number }) {
    const user = this.getSocketUser(client);
    await this.roomsService.demoteOwner(payload.roomCode, payload.userId, user.id);
    return this.broadcastRoomState(payload.roomCode, user.id);
  }

  @SubscribeMessage('room:member:kick')
  async kickMember(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string; userId: number }) {
    const user = this.getSocketUser(client);
    await this.roomsService.kickMember(payload.roomCode, payload.userId, user.id);
    await this.removeUserSocketsFromRoom(payload.roomCode, payload.userId);
    return this.broadcastRoomState(payload.roomCode, user.id);
  }

  @SubscribeMessage('room:queue:add')
  async addQueueItem(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string; videoId: string }) {
    const user = this.getSocketUser(client);
    await this.queueService.add(payload.roomCode, { videoId: payload.videoId }, user.id);
    const currentState = await this.playerSyncService.sync(payload.roomCode, user.id);
    const isOwner = await this.roomsService.assertOwner(payload.roomCode, user.id);
    if (!currentState.currentVideoId && isOwner) {
      const state = await this.playerSyncService.play(payload.roomCode, 0, user.id);
      const queue = await this.queueService.list(payload.roomCode, user.id);
      this.server.to(payload.roomCode).emit('room:player:state', state);
      this.server.to(payload.roomCode).emit('room:queue:update', queue);
      return queue;
    }

    const queue = await this.queueService.list(payload.roomCode, user.id);
    this.server.to(payload.roomCode).emit('room:queue:update', queue);
    return queue;
  }

  @SubscribeMessage('room:queue:remove')
  async removeQueueItem(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string; queueItemId: number }
  ) {
    const user = this.getSocketUser(client);
    await this.queueService.remove(payload.roomCode, payload.queueItemId, user.id);
    const queue = await this.queueService.list(payload.roomCode, user.id);
    this.server.to(payload.roomCode).emit('room:queue:update', queue);
    return queue;
  }

  @SubscribeMessage('room:queue:reorder')
  async reorderQueue(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string; queueItemIds: number[] }
  ) {
    const user = this.getSocketUser(client);
    const queue = await this.queueService.reorder(payload.roomCode, { queueItemIds: payload.queueItemIds }, user.id);
    this.server.to(payload.roomCode).emit('room:queue:update', queue);
    return queue;
  }

  @SubscribeMessage('room:queue:play-now')
  async playQueueItemNow(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string; queueItemId: number }
  ) {
    const user = this.getSocketUser(client);
    const result = await this.queueService.playNow(payload.roomCode, payload.queueItemId, user.id);
    this.server.to(payload.roomCode).emit('room:player:next', result);
    this.server.to(payload.roomCode).emit('room:player:state', result.state);
    this.server.to(payload.roomCode).emit('room:queue:update', result.queue);
    return result;
  }

  @SubscribeMessage('room:player:play')
  async play(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string; currentTime: number }) {
    const user = this.getSocketUser(client);
    const state = await this.playerSyncService.play(payload.roomCode, payload.currentTime, user.id);
    const queue = await this.queueService.list(payload.roomCode, user.id);
    this.server.to(payload.roomCode).emit('room:player:state', state);
    this.server.to(payload.roomCode).emit('room:queue:update', queue);
    return state;
  }

  @SubscribeMessage('room:player:pause')
  async pause(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string; currentTime: number }) {
    const user = this.getSocketUser(client);
    const state = await this.playerSyncService.pause(payload.roomCode, payload.currentTime, user.id);
    this.server.to(payload.roomCode).emit('room:player:state', state);
    return state;
  }

  @SubscribeMessage('room:player:seek')
  async seek(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string; currentTime: number }) {
    const user = this.getSocketUser(client);
    const state = await this.playerSyncService.seek(payload.roomCode, payload.currentTime, user.id);
    this.server.to(payload.roomCode).emit('room:player:seek', state);
    return state;
  }

  @SubscribeMessage('room:player:ended')
  async ended(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string }) {
    const user = this.getSocketUser(client);
    const result = await this.playerSyncService.ended(payload.roomCode, user.id);
    this.server.to(payload.roomCode).emit('room:player:next', result);
    this.server.to(payload.roomCode).emit('room:player:state', result.state);
    this.server.to(payload.roomCode).emit('room:queue:update', result.queue);
    return result;
  }

  @SubscribeMessage('room:player:force-sync')
  async forceSync(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { currentTime?: number; roomCode: string }) {
    const user = this.getSocketUser(client);
    const state =
      typeof payload.currentTime === 'number'
        ? await this.playerSyncService.seek(payload.roomCode, payload.currentTime, user.id)
        : await this.playerSyncService.forceSync(payload.roomCode, user.id);
    this.server.to(payload.roomCode).emit('room:player:force-sync', state);
    return state;
  }

  @SubscribeMessage('room:player:sync')
  async syncPlayer(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() payload: { roomCode: string }) {
    const user = this.getSocketUser(client);
    const state = await this.playerSyncService.sync(payload.roomCode, user.id);
    client.emit('room:player:state', state);
    return state;
  }

  private async authenticate(client: AuthenticatedSocket): Promise<AuthenticatedUser> {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = await this.jwtService.verifyAsync<AuthenticatedUser & { sub: number }>(token);
    return {
      id: Number(payload.sub),
      email: payload.email,
      username: payload.username
    };
  }

  private extractToken(client: AuthenticatedSocket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') {
      return authToken;
    }

    const cookie = client.handshake.headers.cookie;
    const match = cookie?.match(/(?:^|;\s*)access_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  private getSocketUser(client: AuthenticatedSocket) {
    if (!client.data.user) {
      throw new UnauthorizedException();
    }

    return client.data.user;
  }

  private async broadcastRoomState(roomCode: string, userId: number) {
    const room = await this.roomsService.snapshot(roomCode, userId);
    this.server.to(roomCode).emit('room:state', room);
    this.server.to(roomCode).emit('room:member:update', room.members);
    this.server.to(roomCode).emit('room:queue:update', room.queue);
    this.server.to(roomCode).emit('room:player:state', room.playerState);
    return room;
  }

  private async markUserLeftRoom(roomCode: string, userId: number) {
    const stillConnected = await this.hasActiveSocketForUser(roomCode, userId);
    if (stillConnected) {
      return;
    }

    await this.roomsService.leave(roomCode, userId);
    await this.broadcastRoomState(roomCode, userId);
  }

  private async hasActiveSocketForUser(roomCode: string, userId: number) {
    const sockets = await this.server.in(roomCode).fetchSockets();
    return sockets.some((socket) => {
      const data = socket.data as { user?: AuthenticatedUser };
      return data.user?.id === userId;
    });
  }

  private async removeUserSocketsFromRoom(roomCode: string, userId: number) {
    const sockets = await this.server.in(roomCode).fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const data = socket.data as { joinedRooms?: Set<string>; user?: AuthenticatedUser };
        if (data.user?.id !== userId) {
          return;
        }

        socket.emit('room:kicked', { roomCode });
        await socket.leave(roomCode);
        data.joinedRooms?.delete(roomCode);
      })
    );
  }
}
