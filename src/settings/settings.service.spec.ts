import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { UiSetting } from './entities/ui-setting.entity';
import { SystemSetting } from './entities/system-setting.entity';
import { UsersService } from '../users/users.service';

describe('SettingsService', () => {
  let service: SettingsService;
  const userSettingsRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const uiSettingRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const systemSettingRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(UserSettings),
          useValue: userSettingsRepo,
        },
        { provide: getRepositoryToken(UiSetting), useValue: uiSettingRepo },
        {
          provide: getRepositoryToken(SystemSetting),
          useValue: systemSettingRepo,
        },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('normalizes rich app version payload aliases', () => {
    const policies = service.normalizeAppVersionPolicies({
      forceUpdate: true,
      update_message: 'Update now',
      ios: {
        minimumVersion: '2.1.0',
        latestBuild: 55,
        minBuild: 50,
        storeUrl: 'https://apps.apple.com/app/id123',
      },
      android_latest_version: '2.3.0',
      android_min_version: '2.2.0',
      min_build_android: 210,
      latest_build_android: 215,
    });

    expect(policies.ios).toEqual({
      min_version: '2.1.0',
      latest_version: '2.1.0',
      min_build: 50,
      latest_build: 55,
      force_update: true,
      store_url: 'https://apps.apple.com/app/id123',
      message: 'Update now',
    });
    expect(policies.android).toEqual({
      min_version: '2.2.0',
      latest_version: '2.3.0',
      min_build: 210,
      latest_build: 215,
      force_update: true,
      store_url: null,
      message: 'Update now',
    });
  });

  it('builds app version policy from legacy fallback settings', async () => {
    systemSettingRepo.findOne.mockResolvedValue(null);
    uiSettingRepo.findOne.mockImplementation(async ({ where }: any) => {
      const values: Record<string, any> = {
        app_version_android_min: { value: '3.0.0' },
        app_version_android_latest: { value: '3.1.0' },
        app_build_android_min: { value: 300 },
        app_build_android_latest: { value: 310 },
        app_version_ios_min: { value: '4.0.0' },
        app_version_ios_latest: { value: '4.2.0' },
        app_build_ios_min: { value: '400' },
        app_build_ios_latest: { value: '420' },
        app_update_message: { value: 'Critical update available' },
        app_store_url_android: {
          value: 'https://play.google.com/store/apps/details?id=test',
        },
        app_store_url_ios: { value: 'https://apps.apple.com/app/id456' },
        app_force_update_global: { value: true },
      };
      return values[where.key] || null;
    });

    const policies = await service.getAppVersionPolicies();

    expect(policies.android.min_version).toBe('3.0.0');
    expect(policies.android.latest_version).toBe('3.1.0');
    expect(policies.android.min_build).toBe(300);
    expect(policies.android.latest_build).toBe(310);
    expect(policies.android.force_update).toBe(true);
    expect(policies.android.store_url).toContain('play.google.com');
    expect(policies.ios.min_version).toBe('4.0.0');
    expect(policies.ios.latest_version).toBe('4.2.0');
    expect(policies.ios.min_build).toBe(400);
    expect(policies.ios.latest_build).toBe(420);
    expect(policies.ios.store_url).toContain('apps.apple.com');
  });
});
