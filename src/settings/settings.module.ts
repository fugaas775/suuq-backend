import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { UiSetting } from './entities/ui-setting.entity';
import { UserSettings } from './entities/user-settings.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { UsersModule } from '../users/users.module';
import { ConfigController } from './config.controller';

@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([UiSetting, UserSettings, SystemSetting])],
  providers: [SettingsService],
  controllers: [SettingsController, ConfigController],
  exports: [SettingsService],
})
export class SettingsModule {}
