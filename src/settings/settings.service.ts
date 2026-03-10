import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { Repository } from 'typeorm';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UsersService } from '../users/users.service';
import { UiSetting } from './entities/ui-setting.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { UpdateUiSettingDto } from './dto/update-ui-setting.dto';

export type SupportedAppPlatform = 'ios' | 'android';

export type AppVersionPolicy = {
  min_version: string;
  latest_version: string;
  min_build: number;
  latest_build: number;
  force_update: boolean;
  store_url: string | null;
  message: string | null;
};

export type AppVersionPolicies = {
  ios: AppVersionPolicy;
  android: AppVersionPolicy;
};

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

  private readonly supportedPlatforms: SupportedAppPlatform[] = [
    'ios',
    'android',
  ];

  private readonly defaultAppVersionPolicies: AppVersionPolicies = {
    ios: {
      min_version: '1.0.0',
      latest_version: '1.0.0',
      min_build: 0,
      latest_build: 0,
      force_update: false,
      store_url: null,
      message: null,
    },
    android: {
      min_version: '1.0.0',
      latest_version: '1.0.0',
      min_build: 0,
      latest_build: 0,
      force_update: false,
      store_url: null,
      message: null,
    },
  };

  async getSystemSetting(key: string): Promise<any> {
    const setting = await this.systemSettingRepo.findOne({
      where: { key },
      // Cache briefly to avoid hitting DB constantly for hot config
      cache: { id: `sys-setting-${key}`, milliseconds: 60000 },
    });
    return setting ? setting.value : null;
  }

  async setSystemSetting(
    key: string,
    value: any,
    description?: string,
  ): Promise<SystemSetting> {
    let setting = await this.systemSettingRepo.findOne({ where: { key } });
    if (!setting) {
      setting = this.systemSettingRepo.create({ key, value, description });
    } else {
      setting.value = value;
      if (description) setting.description = description;
    }
    return this.systemSettingRepo.save(setting);
  }

  async getAppVersionPolicies(): Promise<AppVersionPolicies> {
    const [storedPolicies, fallbackSettings] = await Promise.all([
      this.getSystemSetting('app_versions'),
      this.getLegacyAppVersionFallbackSettings(),
    ]);

    return this.normalizeAppVersionPolicies(storedPolicies, fallbackSettings);
  }

  async getAppVersionPolicy(
    platform?: string | null,
  ): Promise<AppVersionPolicy | null> {
    const normalizedPlatform = this.normalizePlatform(platform);
    if (!normalizedPlatform) {
      return null;
    }

    const policies = await this.getAppVersionPolicies();
    return policies[normalizedPlatform];
  }

  normalizeAppVersionPolicies(
    input: unknown,
    fallback?: Partial<AppVersionPolicies>,
  ): AppVersionPolicies {
    const source = this.asRecord(input);
    const fallbackPolicies = fallback || {};
    const globalForceUpdate = this.firstBoolean(
      source.force_update,
      source.forceUpdate,
      source.app_force_update_global,
    );
    const globalMessage = this.firstString(
      source.message,
      source.update_message,
      source.app_update_message,
    );

    return this.supportedPlatforms.reduce((acc, platform) => {
      const defaults = this.defaultAppVersionPolicies[platform];
      const platformFallback = fallbackPolicies[platform];

      const minVersion = this.firstString(
        this.pickPlatformValue(source, platform, [
          'min_version',
          'minVersion',
          'minimum_version',
          'minimumVersion',
        ]),
        platformFallback?.min_version,
        defaults.min_version,
      );
      const latestVersion = this.firstString(
        this.pickPlatformValue(source, platform, [
          'latest_version',
          'latestVersion',
          'current_version',
          'currentVersion',
        ]),
        platformFallback?.latest_version,
        minVersion,
        defaults.latest_version,
      );
      const minBuild = this.firstNumber(
        this.pickPlatformValue(source, platform, [
          'min_build',
          'minBuild',
          'minimum_build',
          'minimumBuild',
        ]),
        platformFallback?.min_build,
        defaults.min_build,
      );
      const latestBuild = this.firstNumber(
        this.pickPlatformValue(source, platform, [
          'latest_build',
          'latestBuild',
          'current_build',
          'currentBuild',
        ]),
        platformFallback?.latest_build,
        defaults.latest_build,
        minBuild,
      );
      const forceUpdate = this.firstBoolean(
        this.pickPlatformValue(source, platform, [
          'force_update',
          'forceUpdate',
        ]),
        platformFallback?.force_update,
        globalForceUpdate,
        defaults.force_update,
      );
      const storeUrl = this.normalizeNullableString(
        this.firstString(
          this.pickPlatformValue(source, platform, [
            'store_url',
            'storeUrl',
            'url',
          ]),
          platformFallback?.store_url,
          this.defaultStoreUrl(platform),
        ),
      );
      const message = this.normalizeNullableString(
        this.firstString(
          this.pickPlatformValue(source, platform, [
            'message',
            'update_message',
            'updateMessage',
          ]),
          platformFallback?.message,
          globalMessage,
          defaults.message,
        ),
      );

      acc[platform] = {
        min_version: minVersion || defaults.min_version,
        latest_version: latestVersion || minVersion || defaults.latest_version,
        min_build: Math.max(0, Math.floor(minBuild)),
        latest_build: Math.max(
          Math.floor(latestBuild),
          Math.floor(minBuild),
          0,
        ),
        force_update: forceUpdate,
        store_url: storeUrl,
        message,
      };

      return acc;
    }, {} as AppVersionPolicies);
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

  private async getLegacyAppVersionFallbackSettings(): Promise<AppVersionPolicies> {
    const [
      androidMinVersion,
      androidLatestVersion,
      androidMinBuild,
      androidLatestBuild,
      iosMinVersion,
      iosLatestVersion,
      iosMinBuild,
      iosLatestBuild,
      updateMessage,
      androidStoreUrl,
      iosStoreUrl,
      globalForceUpdate,
    ] = await Promise.all([
      this.getSetting('app_version_android_min', null),
      this.getSetting('app_version_android_latest', null),
      this.getSetting('app_build_android_min', null),
      this.getSetting('app_build_android_latest', null),
      this.getSetting('app_version_ios_min', null),
      this.getSetting('app_version_ios_latest', null),
      this.getSetting('app_build_ios_min', null),
      this.getSetting('app_build_ios_latest', null),
      this.getSetting('app_update_message', null),
      this.getSetting('app_store_url_android', null),
      this.getSetting('app_store_url_ios', null),
      this.getSetting('app_force_update_global', null),
    ]);

    return {
      android: {
        min_version:
          this.firstString(androidMinVersion) ||
          this.defaultAppVersionPolicies.android.min_version,
        latest_version:
          this.firstString(androidLatestVersion) ||
          this.firstString(androidMinVersion) ||
          this.defaultAppVersionPolicies.android.latest_version,
        min_build: this.firstNumber(androidMinBuild, 0),
        latest_build: this.firstNumber(androidLatestBuild, androidMinBuild, 0),
        force_update: this.firstBoolean(globalForceUpdate, false),
        store_url: this.normalizeNullableString(
          this.firstString(androidStoreUrl, this.defaultStoreUrl('android')),
        ),
        message: this.normalizeNullableString(this.firstString(updateMessage)),
      },
      ios: {
        min_version:
          this.firstString(iosMinVersion) ||
          this.defaultAppVersionPolicies.ios.min_version,
        latest_version:
          this.firstString(iosLatestVersion) ||
          this.firstString(iosMinVersion) ||
          this.defaultAppVersionPolicies.ios.latest_version,
        min_build: this.firstNumber(iosMinBuild, 0),
        latest_build: this.firstNumber(iosLatestBuild, iosMinBuild, 0),
        force_update: this.firstBoolean(globalForceUpdate, false),
        store_url: this.normalizeNullableString(
          this.firstString(iosStoreUrl, this.defaultStoreUrl('ios')),
        ),
        message: this.normalizeNullableString(this.firstString(updateMessage)),
      },
    };
  }

  private pickPlatformValue(
    source: Record<string, unknown>,
    platform: SupportedAppPlatform,
    keys: string[],
  ): unknown {
    const platformRecord = this.asRecord(source[platform]);

    for (const key of keys) {
      if (platformRecord[key] !== undefined) {
        return platformRecord[key];
      }
    }

    const aliases = new Set<string>();
    for (const key of keys) {
      aliases.add(`${platform}_${key}`);
      aliases.add(`${key}_${platform}`);
      aliases.add(`${platform}${this.toPascalCase(key)}`);
      aliases.add(`${this.toCamelCase(key)}${this.toPascalCase(platform)}`);
    }

    for (const alias of aliases) {
      if (source[alias] !== undefined) {
        return source[alias];
      }
    }

    return undefined;
  }

  private normalizePlatform(
    platform?: string | null,
  ): SupportedAppPlatform | null {
    const normalized = String(platform || '')
      .trim()
      .toLowerCase();
    return normalized === 'ios' || normalized === 'android' ? normalized : null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private normalizeNullableString(
    value: string | null | undefined,
  ): string | null {
    const normalized = String(value || '').trim();
    return normalized ? normalized : null;
  }

  private firstNumber(...values: unknown[]): number {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  private firstBoolean(...values: unknown[]): boolean {
    for (const value of values) {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
      }
    }
    return false;
  }

  private defaultStoreUrl(platform: SupportedAppPlatform): string | null {
    if (platform === 'ios') {
      return this.normalizeNullableString(
        process.env.APP_STORE_URL_IOS || process.env.IOS_STORE_URL,
      );
    }

    return this.normalizeNullableString(
      process.env.APP_STORE_URL_ANDROID || process.env.ANDROID_STORE_URL,
    );
  }

  private toPascalCase(value: string): string {
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  private toCamelCase(value: string): string {
    const pascal = this.toPascalCase(value);
    return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : '';
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
