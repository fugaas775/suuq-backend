import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { DeviceToken } from './entities/device-token.entity';
import { DeviceTokenService } from './device-token.service';
import { DeviceTokenController } from './device-token.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, DeviceToken]), // ✅ This must be under 'imports'
  ],
  providers: [NotificationsService, DeviceTokenService],
  controllers: [NotificationsController, DeviceTokenController],
})
export class NotificationsModule {}

