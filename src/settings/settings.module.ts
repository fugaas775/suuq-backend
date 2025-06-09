import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserSettings]), UsersModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
