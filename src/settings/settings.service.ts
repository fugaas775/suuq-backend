import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { Repository } from 'typeorm';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UsersService } from '../users/users.service';
import { UiSetting } from './entities/ui-setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private settingsRepo: Repository<UserSettings>,
    private usersService: UsersService,
    @InjectRepository(UiSetting)
    private readonly uiSettingRepo: Repository<UiSetting>,
  ) {}

  async getUserSettings(
    userId: number,
  ): Promise<{ userId: number; theme: string; notificationsEnabled: boolean }> {
    let settings = await this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!settings) {
      const user = await this.usersService.findOne(userId);
      if (!user)
        throw new NotFoundException(`User with ID ${userId} not found`);

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
      if (!user)
        throw new NotFoundException(`User with ID ${userId} not found`);

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

  async getAllSettings(): Promise<Record<string, any>> {
    const settings = await this.uiSettingRepo.find();
    const result: Record<string, any> = {};
    settings.forEach((s) => {
      result[s.key] = s.value;
    });
    return result;
  }

  async updateSetting(key: string, value: any): Promise<UiSetting | null> {
    const setting = await this.uiSettingRepo.findOne({ where: { key } });
    if (!setting) {
      throw new NotFoundException(`Setting with key '${key}' not found.`);
    }

    // ✨ ADD THIS LOGIC ✨
    // Keys that should be stored as an array of strings
    const arrayKeys = ['home_search_placeholders', 'product_card_promos'];

    // If the incoming value is a string for one of our array keys, split it.
    if (arrayKeys.includes(key) && typeof value === 'string') {
      // Split by comma, trim whitespace from each item, and filter out any empty strings
      setting.value = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      setting.value = value;
    }

    return this.uiSettingRepo.save(setting);
  }
}
