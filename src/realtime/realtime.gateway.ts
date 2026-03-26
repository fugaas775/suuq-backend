import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
// You might want to use a simplified JWT check or similar for WebSocket Auth
// For now, assume clients connect with a user ID handshake or similar logic.

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'location',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private static readonly PROCUREMENT_INTERVENTIONS_ROOM =
    'procurement_interventions';

  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly redisService: RedisService) {}

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Deliverer joins a room for a specific order to broadcast location
   */
  @SubscribeMessage('joinOrderRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId: string; userId: number },
  ) {
    const roomName = `order_${payload.orderId}`;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.join(roomName);
    this.logger.debug(`User ${payload.userId} joined room ${roomName}`);
    return { event: 'joinedRoom', room: roomName };
  }

  /**
   * Deliverer explicitly leaves the room
   */
  @SubscribeMessage('leaveOrderRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId: string },
  ) {
    const roomName = `order_${payload.orderId}`;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.leave(roomName);
    this.logger.debug(`Client ${client.id} left room ${roomName}`);
  }

  /**
   * Deliverer sends location updates
   * - Saves to Redis for lightweight persistence / retrieval
   * - Broadcasts purely via WebSocket to others in the room (Buyer, Vendor)
   */
  @SubscribeMessage('updateLocation')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orderId: string; lat: number; lng: number },
  ) {
    const { orderId, lat, lng } = payload;
    const roomName = `order_${orderId}`;

    // Optimization: Save to Redis only (Ephemeral state)
    // Key ex: location:order:123
    // Expires in 1 hour (auto-cleanup)
    const redisKey = `location:order:${orderId}`;
    await this.redisService.set(
      redisKey,
      JSON.stringify({ lat, lng, timestamp: Date.now() }),
      3600, // 1 hour TTL
    );

    // Broadcast to room (excluding sender if needed, but here sender is deliverer)
    // to: roomName sends to everyone including sender unless broadcast.to()
    this.server.to(roomName).emit('delivererLocation', {
      orderId,
      lat,
      lng,
    });
  }

  /**
   * Called by backend services when an order is completed/delivered.
   * Emits a completion event and cleans up Redis.
   */
  async notifyOrderComplete(orderId: number) {
    const roomName = `order_${orderId}`;
    this.logger.log(
      `Order ${orderId} completed. Cleaning up room ${roomName}.`,
    );

    // Emit final event so clients know to stop tracking
    this.server.to(roomName).emit('orderCompleted', { orderId });

    // Clean up Redis key immediately
    const redisKey = `location:order:${orderId}`;
    await this.redisService.del(redisKey);
  }

  @SubscribeMessage('joinProcurementInterventionsRoom')
  handleJoinProcurementInterventionsRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId?: number },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.join(RealtimeGateway.PROCUREMENT_INTERVENTIONS_ROOM);
    this.logger.debug(
      `User ${payload.userId ?? 'unknown'} joined room ${RealtimeGateway.PROCUREMENT_INTERVENTIONS_ROOM}`,
    );
    return {
      event: 'joinedRoom',
      room: RealtimeGateway.PROCUREMENT_INTERVENTIONS_ROOM,
    };
  }

  @SubscribeMessage('leaveProcurementInterventionsRoom')
  handleLeaveProcurementInterventionsRoom(@ConnectedSocket() client: Socket) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.leave(RealtimeGateway.PROCUREMENT_INTERVENTIONS_ROOM);
    this.logger.debug(
      `Client ${client.id} left room ${RealtimeGateway.PROCUREMENT_INTERVENTIONS_ROOM}`,
    );
  }

  notifyProcurementInterventionUpdated(payload: {
    supplierProfileId: number;
    branchId: number;
    action: string;
    actorId: number | null;
    actorEmail: string | null;
    assigneeUserId: number | null;
    note: string | null;
    occurredAt: string;
    intervention: Record<string, unknown>;
  }) {
    this.server
      .to(RealtimeGateway.PROCUREMENT_INTERVENTIONS_ROOM)
      .emit('procurementInterventionUpdated', payload);
  }

  notifyProcurementPurchaseOrderUpdated(payload: {
    purchaseOrderId: number;
    branchId: number;
    supplierProfileId: number;
    action: string;
    previousStatus: string | null;
    currentStatus: string;
    actorId: number | null;
    actorEmail: string | null;
    reason: string | null;
    trackingReference: string | null;
    occurredAt: string;
    metadata?: Record<string, unknown> | null;
    receiptSummary?: Record<string, unknown>[] | null;
    purchaseOrder: Record<string, unknown>;
  }) {
    this.server
      .to(RealtimeGateway.PROCUREMENT_INTERVENTIONS_ROOM)
      .emit('procurementPurchaseOrderUpdated', payload);
  }
}
