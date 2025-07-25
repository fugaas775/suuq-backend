import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { DeviceToken } from './entities/device-token.entity';
import { FirebaseModule } from '../firebase/firebase.module';
import { NotificationsController } from './notifications.controller';
import { UsersModule } from '../users/users.module'; // <-- IMPORT THIS

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken]),
    FirebaseModule,
    UsersModule, // <-- ADD THIS
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
