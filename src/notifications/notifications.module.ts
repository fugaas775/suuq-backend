import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { DeviceToken } from './entities/device-token.entity';
import { Notification } from './entities/notification.entity';
import { FirebaseModule } from '../firebase/firebase.module';
import { NotificationsController } from './notifications.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken, Notification]),
    BullModule.registerQueue({
      name: 'notifications',
    }),
    FirebaseModule,
    forwardRef(() => UsersModule),
  ],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
