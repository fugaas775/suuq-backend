import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserSettings } from './user-settings.entity';
import { Repository } from 'typeorm';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private settingsRepo: Repository<UserSettings>,
    private usersService: UsersService,
  ) {}

  async getUserSettings(userId: number) {
    let settings = await this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!settings) {
      const user = await this.usersService.findOne(userId);
      if (!user) throw new Error(`User with ID ${userId} not found`);

      settings = await this.settingsRepo.save(
        this.settingsRepo.create({ user }),
      );
    }

    return {
      userId,
      theme: settings.theme,
      notificationsEnabled: settings.notificationsEnabled,
    };
  }

  async updateUserSettings(userId: number, dto: UpdateSettingsDto) {
    let settings = await this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!settings) {
      const user = await this.usersService.findOne(userId);
      if (!user) throw new Error(`User with ID ${userId} not found`);

      const newSettings = this.settingsRepo.create({ ...dto, user });
      return await this.settingsRepo.save(newSettings);
    }

    Object.assign(settings, dto);
    return await this.settingsRepo.save(settings);
  }
}
