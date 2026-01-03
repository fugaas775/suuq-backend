/* eslint-disable @typescript-eslint/no-base-to-string */
import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DeviceToken } from './entities/device-token.entity';
import type {
  FirebaseMessagingResponse,
  FirebaseAdmin,
} from './notifications.types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebase: FirebaseAdmin,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Send a push notification to all devices of a user.
   */
  async sendToUser({
    userId,
    title,
    body,
    data,
  }: {
    userId: number;
    title: string;
    body: string;
    data?: Record<string, string>;
  }) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.warn(`Skip send: user ${userId} not found`);
      return { successCount: 0, failureCount: 0 } as FirebaseMessagingResponse;
    }

    // Fetch device tokens for the user
    const tokens = await this.deviceTokenRepository.find({ where: { userId } });
    const deviceTokens = tokens.map((t) => t.token).filter(Boolean);
    if (!deviceTokens.length) {
      this.logger.warn(`No device tokens found for user ${userId}`);
      return { successCount: 0, failureCount: 0 };
    }
    const message = {
      notification: { title, body },
      data,
      tokens: deviceTokens,
    } as const;
    // firebase-admin v13 uses sendEachForMulticast
    try {
      const messaging = this.firebase.messaging?.();
      if (!messaging?.sendEachForMulticast) {
        this.logger.error('Firebase messaging not available');
        return {
          successCount: 0,
          failureCount: 0,
        } as FirebaseMessagingResponse;
      }

      const response = await messaging.sendEachForMulticast(message);
      if (!response) {
        this.logger.error('Firebase messaging not available');
        return {
          successCount: 0,
          failureCount: 0,
        } as FirebaseMessagingResponse;
      }
      await this.pruneInvalidTokens(response, deviceTokens);
      this.logger.log(
        `Sent notification to user ${userId}: ${response.successCount} success, ${response.failureCount} failure`,
      );
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to send notification to user ${userId}: ${msg}`,
      );
      return { successCount: 0, failureCount: 0 } as FirebaseMessagingResponse;
    }
  }

  /**
   * Register a device token for a user.
   */
  async registerDeviceToken(dto: {
    userId: number;
    token: string;
    platform?: string;
  }) {
    const user = await this.usersService.findOne(dto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.deviceTokenRepository.upsert(
      {
        userId: dto.userId,
        token: dto.token,
        platform: dto.platform || 'unknown',
      },
      ['token'],
    );

    return { success: true };
  }

  /**
   * Unregister a device token (e.g. on logout).
   */
  async unregisterDeviceToken(token: string) {
    await this.deviceTokenRepository.delete({ token });
    return { success: true };
  }

  /**
   * Subscribe a device to a topic.
   */
  async subscribeToTopic(token: string, topic: string) {
    try {
      const messaging = this.firebase.messaging?.();
      if (messaging && 'subscribeToTopic' in messaging) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await (messaging as any).subscribeToTopic([token], topic);
      }
    } catch (e) {
      this.logger.warn(`Failed to subscribe to topic ${topic}: ${e}`);
    }
    return { success: true };
  }

  /**
   * Unsubscribe a device from a topic.
   */
  async unsubscribeFromTopic(token: string, topic: string) {
    try {
      const messaging = this.firebase.messaging?.();
      if (messaging && 'unsubscribeFromTopic' in messaging) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await (messaging as any).unsubscribeFromTopic([token], topic);
      }
    } catch (e) {
      this.logger.warn(`Failed to unsubscribe from topic ${topic}: ${e}`);
    }
    return { success: true };
  }

  private async pruneInvalidTokens(
    response: FirebaseMessagingResponse,
    tokens: string[],
  ) {
    if (!response.responses?.length) return;

    const invalidCodes = new Set([
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ]);

    const invalidTokens = response.responses
      .map((res, idx) => ({ res, token: tokens[idx] }))
      .filter(
        ({ res }) =>
          !res.success && res.error?.code && invalidCodes.has(res.error.code),
      )
      .map(({ token }) => token)
      .filter(Boolean);

    if (!invalidTokens.length) return;

    await this.deviceTokenRepository.delete({ token: In(invalidTokens) });
    this.logger.warn(
      `Pruned ${invalidTokens.length} invalid device tokens: ${invalidTokens.join(', ')}`,
    );
  }
}
