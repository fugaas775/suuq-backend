import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { Repository } from 'typeorm';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UsersService } from '../users/users.service';
import { UiSetting } from './entities/ui-setting.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { UpdateUiSettingDto } from './dto/update-ui-setting.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private settingsRepo: Repository<UserSettings>,
    private usersService: UsersService,
    @InjectRepository(UiSetting)
    private readonly uiSettingRepo: Repository<UiSetting>,
    @InjectRepository(SystemSetting)
    private readonly systemSettingRepo: Repository<SystemSetting>,
  ) {}

  async getSystemSetting(key: string): Promise<any> {
    const setting = await this.systemSettingRepo.findOne({
      where: { key },
      // Cache briefly to avoid hitting DB constantly for hot config
      cache: { id: `sys-setting-${key}`, milliseconds: 60000 },
    });
    return setting ? setting.value : null;
  }

  async setSystemSetting(key: string, value: any, description?: string): Promise<SystemSetting> {
    let setting = await this.systemSettingRepo.findOne({ where: { key } });
    if (!setting) {
      setting = this.systemSettingRepo.create({ key, value, description });
    } else {
      setting.value = value;
      if (description) setting.description = description;
    }
    return this.systemSettingRepo.save(setting);
  }

  async getUserSettings(
    userId: number,
  ): Promise<{ userId: number; theme: string; notificationsEnabled: boolean }> {
    const settings = await this.ensureUserSettings(userId, {});

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
    const saved = await this.ensureUserSettings(userId, dto);
    return {
      userId,
      theme: saved.theme,
      notificationsEnabled: saved.notificationsEnabled,
    };
  }

  async getAllSettings(): Promise<Record<string, any>> {
    const settings = await this.uiSettingRepo.find({
      cache: { id: 'ui-settings', milliseconds: 30000 },
    });
    const result: Record<string, any> = {};
    settings.forEach((s) => {
      result[s.key] = s.value;
    });
    return result;
  }

  async getSetting(key: string, defaultValue: any = null): Promise<any> {
    const setting = await this.uiSettingRepo.findOne({
      where: { key },
      cache: { id: `ui-setting-${key}`, milliseconds: 30000 },
    });
    return setting ? setting.value : defaultValue;
  }

  async updateSetting(dto: UpdateUiSettingDto): Promise<UiSetting> {
    const key = dto.key;
    const setting = await this.uiSettingRepo.findOne({ where: { key } });
    if (!setting) {
      throw new NotFoundException(`Setting with key '${key}' not found.`);
    }

    const arrayKeys = new Set([
      'home_search_placeholders',
      'product_card_promos',
    ]);

    if (arrayKeys.has(key)) {
      if (Array.isArray(dto.value)) {
        setting.value = dto.value.map((s) => String(s).trim()).filter(Boolean);
      } else if (typeof dto.value === 'string') {
        const trimmed = dto.value.trim();
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            setting.value = parsed.map((s) => String(s).trim()).filter(Boolean);
          } else {
            setting.value = trimmed
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } catch {
          setting.value = trimmed
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      } else {
        setting.value = []; // default empty when no value provided
      }
    } else {
      setting.value = dto.value ?? setting.value;
    }

    return this.uiSettingRepo.save(setting);
  }

  private async ensureUserSettings(
    userId: number,
    dto: UpdateSettingsDto,
  ): Promise<UserSettings> {
    const existing = await this.settingsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (existing) {
      Object.assign(existing, dto);
      return this.settingsRepo.save(existing);
    }

    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    try {
      const created = this.settingsRepo.create({ ...dto, user });
      return await this.settingsRepo.save(created);
    } catch (err: any) {
      // Handle race where another request inserted concurrently (unique constraint on user_id)
      if (err?.code === '23505') {
        const retry = await this.settingsRepo.findOne({
          where: { user: { id: userId } },
          relations: ['user'],
        });
        if (retry) {
          Object.assign(retry, dto);
          return this.settingsRepo.save(retry);
        }
      }
      throw err;
    }
  }
}
