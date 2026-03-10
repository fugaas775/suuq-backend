import { HttpException } from '@nestjs/common';
import { AppVersionMiddleware } from './app-version.middleware';

describe('AppVersionMiddleware', () => {
  const settingsService = {
    getAppVersionPolicy: jest.fn(),
  };

  const middleware = new AppVersionMiddleware(settingsService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests below minimum build', async () => {
    settingsService.getAppVersionPolicy.mockResolvedValue({
      min_version: '2.0.0',
      latest_version: '2.2.0',
      min_build: 200,
      latest_build: 220,
      force_update: false,
      store_url: 'https://play.google.com/store/apps/details?id=test',
      message: 'Please update',
    });

    const req = {
      headers: {
        'x-app-version': '2.1.0',
        'x-app-build': '199',
        'x-platform': 'android',
      },
    } as any;

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toMatchObject<HttpException>({
      response: expect.objectContaining({
        statusCode: 426,
        reason: 'min_build',
        min_build: 200,
      }),
    });
  });

  it('rejects requests when force update is enabled and build is stale', async () => {
    settingsService.getAppVersionPolicy.mockResolvedValue({
      min_version: '2.0.0',
      latest_version: '2.3.0',
      min_build: 200,
      latest_build: 230,
      force_update: true,
      store_url: 'https://apps.apple.com/app/id123',
      message: 'Critical update',
    });

    const req = {
      headers: {
        'x-app-version': '2.2.0',
        'x-app-build': '229',
        'x-platform': 'ios',
      },
    } as any;

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toMatchObject<HttpException>({
      response: expect.objectContaining({
        statusCode: 426,
        reason: 'force_update',
        latest_build: 230,
        force_update: true,
      }),
    });
  });

  it('passes requests that satisfy the current policy', async () => {
    settingsService.getAppVersionPolicy.mockResolvedValue({
      min_version: '2.0.0',
      latest_version: '2.1.0',
      min_build: 100,
      latest_build: 110,
      force_update: false,
      store_url: null,
      message: null,
    });

    const next = jest.fn();
    const req = {
      headers: {
        'x-app-version': '2.1.0',
        'x-app-build': '110',
        'x-platform': 'android',
      },
    } as any;

    await middleware.use(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
