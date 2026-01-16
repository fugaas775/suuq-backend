import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, Injectable, forwardRef } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceToken } from './entities/device-token.entity';
import { Notification, NotificationType } from './entities/notification.entity';
import { UserRole } from '../auth/roles.enum';
import type { FirebaseAdmin } from './notifications.types';

export interface BroadcastJobData {
  role: UserRole;
  title: string;
  body: string;
  type?: NotificationType;
  data?: Record<string, any>;
}

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebase: FirebaseAdmin,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {
    super();
  }

  async process(job: Job<BroadcastJobData>): Promise<any> {
    switch (job.name) {
      case 'broadcast':
        return this.handleBroadcast(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleBroadcast(opts: BroadcastJobData) {
    this.logger.log(`Processing broadcast job for role: ${opts.role}`);

    // 1. Fetch Recipients
    const users = await this.usersService.findRecipientsByRole(opts.role);
    if (!users.length) return { success: true, count: 0 };

    // 2. Bulk Persist Notifications
    const rawType = opts.type
      ? opts.type.toString().toUpperCase()
      : NotificationType.SYSTEM;
    const type = Object.values(NotificationType).includes(
      rawType as NotificationType,
    )
      ? (rawType as NotificationType)
      : NotificationType.SYSTEM;

    const notifications = users.map((u) =>
      this.notificationRepository.create({
        recipient: { id: u.id },
        title: opts.title,
        body: opts.body,
        type,
        data: opts.data || {},
      }),
    );

    // Chunk DB inserts (e.g. 1000 at a time)
    const chunkSize = 1000;
    for (let i = 0; i < notifications.length; i += chunkSize) {
      await this.notificationRepository.save(
        notifications.slice(i, i + chunkSize),
      );
    }

    // 3. Push to Tokens
    const userIds = users.map((u) => u.id);
    const tokens: string[] = [];
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      const chunkTokens = await this.deviceTokenRepository.find({
        where: { userId: In(chunk) },
      });
      tokens.push(...chunkTokens.map((t) => t.token));
    }

    if (!tokens.length)
      return { success: true, count: users.length, pushed: 0 };

    // 4. Send FCM (chunk to 500)
    const fcmChunkSize = 500;
    const uniqueTokens = [...new Set(tokens)];

    let successCount = 0;
    let failureCount = 0;
    let throttledCount = 0;

    const fcmData = opts.data
      ? Object.entries(opts.data).reduce((acc, [k, v]) => {
          acc[k] = String(v);
          return acc;
        }, {} as Record<string, string>)
      : undefined;

    const messageBase = {
      notification: { title: opts.title, body: opts.body },
      data: fcmData,
    };

    const messaging = this.firebase.messaging?.();
    if (messaging && messaging.sendEachForMulticast) {
      this.logger.log(`Starting FCM broadcast to ${uniqueTokens.length} tokens`);
      for (let i = 0; i < uniqueTokens.length; i += fcmChunkSize) {
        const batch = uniqueTokens.slice(i, i + fcmChunkSize);
        try {
          const response = await messaging.sendEachForMulticast({
            ...messageBase,
            tokens: batch,
          });
          successCount += response.successCount;
          failureCount += response.failureCount;

           // Check for specific errors
           if (response.failureCount > 0) {
            response.responses.forEach((res) => {
               if (!res.success && res.error) {
                 const code = res.error.code;
                 if (code === 'messaging/quota-exceeded' || code === 'messaging/device-message-rate-exceeded') {
                    throttledCount++;
                 }
               }
            });
          }

          await this.pruneInvalidTokens(response, batch);
          
        } catch (e) {
          this.logger.error(`Batch FCM failed: ${e}`);
          failureCount += batch.length;
        }
      }
    }
    
    this.logger.log(`Broadcast complete. Success: ${successCount}, Failed: ${failureCount}, Throttled: ${throttledCount}`);
    return { successCount, failureCount };
  }

  private async pruneInvalidTokens(
    response: any,
    tokens: string[],
  ) {
    if (!response.responses?.length) return;

    const invalidCodes = new Set([
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ]);

    const invalidTokens = response.responses
      .map((res: any, idx: number) => ({ res, token: tokens[idx] }))
      .filter(
        ({ res }) =>
          !res.success && res.error?.code && invalidCodes.has(res.error.code),
      )
      .map(({ token }: { token: string }) => token)
      .filter(Boolean);

    if (!invalidTokens.length) return;

    await this.deviceTokenRepository.delete({ token: In(invalidTokens) });
    this.logger.warn(
      `Pruned ${invalidTokens.length} invalid device tokens`,
    );
  }
}
