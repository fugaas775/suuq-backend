import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserSettings } from './entities/user-settings.entity';
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

  async getUserSettings(userId: number): Promise<{ userId: number; theme: string; notificationsEnabled: boolean }> {
    let settings = await this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!settings) {
      const user = await this.usersService.findOne(userId);
      if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

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

  async updateUserSettings(
    userId: number,
    dto: UpdateSettingsDto,
  ): Promise<{ userId: number; theme: string; notificationsEnabled: boolean }> {
    let settings = await this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!settings) {
      const user = await this.usersService.findOne(userId);
      if (!user) throw new NotFoundException(`User with ID ${userId} not found`);

      settings = this.settingsRepo.create({ ...dto, user });
    } else {
      Object.assign(settings, dto);
    }

    const saved = await this.settingsRepo.save(settings);
    return {
      userId,
      theme: saved.theme,
      notificationsEnabled: saved.notificationsEnabled,
    };
  }
}