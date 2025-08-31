import { Injectable, Inject, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DeviceToken } from './entities/device-token.entity';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebase: any,
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
  }: {
    userId: number;
    title: string;
    body: string;
  }) {
    // Fetch device tokens for the user
    const tokens = await this.deviceTokenRepository.find({ where: { userId } });
    const deviceTokens = tokens.map((t) => t.token).filter(Boolean);
    if (!deviceTokens.length) {
      this.logger.warn(`No device tokens found for user ${userId}`);
      return { successCount: 0, failureCount: 0 };
    }
    const message = {
      notification: { title, body },
      tokens: deviceTokens,
    } as any;
    // firebase-admin v13 uses sendEachForMulticast
    try {
      const response = await this.firebase
        .messaging()
        .sendEachForMulticast(message);
      this.logger.log(
        `Sent notification to user ${userId}: ${response.successCount} success, ${response.failureCount} failure`,
      );
      return response;
    } catch (err) {
      this.logger.error(
        `Failed to send notification to user ${userId}: ${err?.message || err}`,
      );
      return { successCount: 0, failureCount: 0 } as any;
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
    // Upsert device token for user
    let device = await this.deviceTokenRepository.findOne({
      where: { userId: dto.userId, token: dto.token },
    });
    if (!device) {
      device = this.deviceTokenRepository.create({
        userId: dto.userId,
        token: dto.token,
        platform: dto.platform || 'unknown',
      });
    } else {
      device.platform = dto.platform || device.platform;
    }
    await this.deviceTokenRepository.save(device);
    return { success: true };
  }
}
