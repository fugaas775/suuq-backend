import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { DeviceToken } from './entities/device-token.entity';
import { UsersService } from '../users/users.service';
import type { FirebaseMessagingResponse } from './notifications.types';

const makeFirebaseMock = (response: FirebaseMessagingResponse) => {
  const sendEachForMulticast = jest.fn(async () => response);
  return {
    messaging: () => ({ sendEachForMulticast }),
    __mock: { sendEachForMulticast },
  } as const;
};

const makeRepoMock = () => {
  let idSeq = 1;
  const store: DeviceToken[] = [];

  const matchTokens = (criteria: any): string[] => {
    if (!criteria?.token) return [];
    const t = criteria.token;
    if (Array.isArray(t)) return t;
    if (typeof t === 'object') {
      if ('value' in t) return t.value as string[];
      if ('_value' in t) return t._value as string[];
    }
    return [t];
  };

  return {
    query: jest.fn(async (..._args: any[]) => {
      store.splice(0, store.length);
    }),
    find: jest.fn(
      async (opts?: { where?: Partial<DeviceToken>; order?: any }) => {
        const where = opts?.where || {};
        let results = store.filter((t) =>
          Object.entries(where).every(([k, v]) => (t as any)[k] === v),
        );
        if (opts?.order?.token === 'ASC') {
          results = [...results].sort((a, b) => a.token.localeCompare(b.token));
        }
        return results;
      },
    ),
    upsert: jest.fn(async (payload: DeviceToken, _conflictPaths: string[]) => {
      const existing = store.find((t) => t.token === payload.token);
      if (existing) {
        existing.userId = payload.userId;
        existing.platform = payload.platform;
        return existing;
      }
      store.push({
        ...payload,
        id: idSeq++,
        createdAt: new Date(),
      } as DeviceToken);
      return payload;
    }),
    save: jest.fn(async (payload: Partial<DeviceToken>) => {
      store.push({
        id: idSeq++,
        createdAt: new Date(),
        platform: 'unknown',
        ...payload,
      } as DeviceToken);
    }),
    delete: jest.fn(async (criteria: any) => {
      const tokens = matchTokens(criteria);
      if (!tokens.length) return;
      for (const tok of tokens) {
        const idx = store.findIndex((t) => t.token === tok);
        if (idx >= 0) store.splice(idx, 1);
      }
    }),
    dump: () => store,
  } as const;
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: ReturnType<typeof makeRepoMock>;
  let usersService: jest.Mocked<{
    findOne: (id: number) => Promise<{ id: number } | null>;
  }>;
  let firebaseMock: ReturnType<typeof makeFirebaseMock>;

  beforeAll(async () => {
    usersService = {
      findOne: jest.fn<(id: number) => Promise<{ id: number } | null>>(),
    } as any;
    firebaseMock = makeFirebaseMock({ successCount: 0, failureCount: 0 });
    repo = makeRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: 'FIREBASE_ADMIN', useFactory: () => firebaseMock },
        { provide: UsersService, useValue: usersService },
        { provide: getRepositoryToken(DeviceToken), useValue: repo },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  beforeEach(async () => {
    await repo.query('DELETE FROM device_tokens');
    firebaseMock.__mock.sendEachForMulticast.mockReset();
    usersService.findOne.mockReset();
    usersService.findOne.mockResolvedValue({ id: 1 });
  });

  it('registers a device token once via upsert', async () => {
    await service.registerDeviceToken({
      userId: 1,
      token: 'tok',
      platform: 'ios',
    });
    await service.registerDeviceToken({
      userId: 2,
      token: 'tok',
      platform: 'android',
    });

    const tokens = await repo.find();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId: 2,
      token: 'tok',
      platform: 'android',
    });
  });

  it('prunes invalid tokens after send', async () => {
    usersService.findOne.mockResolvedValue({ id: 1 });
    await repo.save({ userId: 1, token: 'good', platform: 'ios' });
    await repo.save({ userId: 1, token: 'bad', platform: 'ios' });

    const response: FirebaseMessagingResponse = {
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: {
            code: 'messaging/invalid-registration-token',
            message: 'invalid',
          },
        },
      ],
    };
    firebaseMock = makeFirebaseMock(response);

    // Swap firebase provider mock to return the updated response
    (service as any).firebase = firebaseMock as any;

    await service.sendToUser({ userId: 1, title: 't', body: 'b' });

    const remaining = await repo.find({ order: { token: 'ASC' } });
    expect(remaining.map((r) => r.token)).toEqual(['good']);
    expect(firebaseMock.__mock.sendEachForMulticast).toHaveBeenCalledTimes(1);
  });
});
