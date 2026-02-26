import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Module } from '@nestjs/common';
import { HomeV2Controller } from '../src/home/v2.home.controller';
import { HomeService } from '../src/home/home.service';
import { closeE2eApp } from './utils/e2e-cleanup';

const homeServiceMock = {
  getV2HomeFeed: jest.fn(),
};

@Module({
  controllers: [HomeV2Controller],
  providers: [{ provide: HomeService, useValue: homeServiceMock }],
})
class TestHomeV2Module {}

describe('Home V2 Feed Contract (e2e-lite)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestHomeV2Module],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await closeE2eApp({ app });
  });

  beforeEach(() => {
    homeServiceMock.getV2HomeFeed.mockReset();
    homeServiceMock.getV2HomeFeed.mockResolvedValue({
      exploreProducts: { items: [], total: 0, page: 1 },
      meta: {
        requestId: 'req-test',
        refreshReason: 'initial_load',
        geoScopeUsed: 'none',
        exploreSource: 'tiered',
        exploreCount: 0,
        applyPriority: 40,
        requestKind: 'background',
        rotationBucket: '2026-02-25T10:00:00.000Z',
        rankingTierCounts: {
          city_country: 0,
          region_country: 0,
          country_only: 0,
          geo_append: 0,
        },
      },
    });
  });

  it('maps geo/rotation aliases and defaults correctly', async () => {
    await request(app.getHttpServer())
      .get('/api/v2/home/feed')
      .query({
        page: '2',
        per_page: '30',
        user_country: 'Ethiopia',
        user_region: 'Addis Ababa',
        user_city: 'Addis Ababa',
        rotation_key: 'rk-1',
        session_salt: 'salt-1',
        time_bucket: '2026-02-25T10:00:00.000Z',
        refresh_reason: 'revisit_resume',
        request_id: 'req-abc',
      })
      .expect(200);

    expect(homeServiceMock.getV2HomeFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        perPage: 30,
        userCountry: 'Ethiopia',
        userRegion: 'Addis Ababa',
        userCity: 'Addis Ababa',
        geoAppend: true,
        geoCountryStrict: true,
        rotationKey: 'rk-1',
        sessionSalt: 'salt-1',
        rotationBucket: '2026-02-25T10:00:00.000Z',
        refreshReason: 'revisit_resume',
        requestId: 'req-abc',
      }),
    );
  });

  it('accepts camelCase aliases and boolean overrides', async () => {
    await request(app.getHttpServer())
      .get('/api/v2/home/feed')
      .query({
        userCountry: 'Kenya',
        userRegion: 'Nairobi',
        userCity: 'Nairobi',
        geoAppend: 'false',
        geoCountryStrict: 'false',
        rotationKey: 'rk-2',
        sessionSalt: 'salt-2',
        timeBucket: '2026-02-25T10:10:00.000Z',
        refreshReason: 'pull_to_refresh',
        requestId: 'req-camel',
      })
      .expect(200);

    expect(homeServiceMock.getV2HomeFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        userCountry: 'Kenya',
        userRegion: 'Nairobi',
        userCity: 'Nairobi',
        geoAppend: false,
        geoCountryStrict: false,
        rotationKey: 'rk-2',
        sessionSalt: 'salt-2',
        rotationBucket: '2026-02-25T10:10:00.000Z',
        refreshReason: 'pull_to_refresh',
        requestId: 'req-camel',
      }),
    );
  });

  it('emits X-Home-Explore-Source header for QA visibility', async () => {
    homeServiceMock.getV2HomeFeed.mockResolvedValueOnce({
      exploreProducts: { items: [], total: 0, page: 1 },
      meta: {
        requestId: 'req-fallback',
        refreshReason: 'pull_to_refresh',
        geoScopeUsed: 'none',
        exploreSource: 'fallback',
        exploreCount: 0,
        applyPriority: 100,
        requestKind: 'refresh',
        rotationBucket: '2026-02-25T10:00:00.000Z',
        rankingTierCounts: {
          city_country: 0,
          region_country: 0,
          country_only: 0,
          geo_append: 0,
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v2/home/feed')
      .query({ request_id: 'req-fallback', refresh_reason: 'pull_to_refresh' })
      .expect(200);

    expect(res.headers['x-home-explore-source']).toBe('fallback');
    expect(res.headers['x-home-explore-count']).toBe('0');
    expect(res.headers['x-home-request-id']).toBe('req-fallback');
    expect(res.headers['x-home-request-kind']).toBe('refresh');
    expect(res.headers['x-home-apply-priority']).toBe('100');
  });
});
