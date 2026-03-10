import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  const settingsServiceMock = {
    getAppVersionPolicies: jest.fn(),
    normalizeAppVersionPolicies: jest.fn(),
    setSystemSetting: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: settingsServiceMock }],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns normalized app version policies', async () => {
    settingsServiceMock.getAppVersionPolicies.mockResolvedValue({
      ios: {
        min_version: '1.0.0',
        latest_version: '1.1.0',
        min_build: 10,
        latest_build: 11,
        force_update: false,
        store_url: 'https://apps.apple.com/app/id123',
        message: 'Update available',
      },
      android: {
        min_version: '1.0.0',
        latest_version: '1.2.0',
        min_build: 20,
        latest_build: 22,
        force_update: true,
        store_url: 'https://play.google.com/store/apps/details?id=test',
        message: 'Update available',
      },
    });

    await expect(controller.getAppVersions()).resolves.toEqual({
      ios: expect.objectContaining({ min_build: 10 }),
      android: expect.objectContaining({ latest_build: 22 }),
    });
  });

  it('normalizes app version payload before persisting', async () => {
    const normalized = {
      ios: {
        min_version: '2.0.0',
        latest_version: '2.1.0',
        min_build: 100,
        latest_build: 110,
        force_update: false,
        store_url: 'https://apps.apple.com/app/id777',
        message: 'Update',
      },
      android: {
        min_version: '2.0.0',
        latest_version: '2.1.0',
        min_build: 200,
        latest_build: 210,
        force_update: true,
        store_url: 'https://play.google.com/store/apps/details?id=demo',
        message: 'Update',
      },
    };
    settingsServiceMock.getAppVersionPolicies.mockResolvedValue(normalized);
    settingsServiceMock.normalizeAppVersionPolicies.mockReturnValue(normalized);
    settingsServiceMock.setSystemSetting.mockResolvedValue({
      value: normalized,
    });

    await controller.updateAppVersions({ android: { minBuild: 200 } });

    expect(
      settingsServiceMock.normalizeAppVersionPolicies,
    ).toHaveBeenCalledWith({ android: { minBuild: 200 } }, normalized);
    expect(settingsServiceMock.setSystemSetting).toHaveBeenCalledWith(
      'app_versions',
      normalized,
      'Minimum and latest app versions for force update',
    );
  });
});
