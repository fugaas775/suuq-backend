import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { DeviceToken } from './entities/device-token.entity';
import { FirebaseModule } from '../firebase/firebase.module';
import { NotificationsController } from './notifications.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken]),
    FirebaseModule,
    forwardRef(() => UsersModule),
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
