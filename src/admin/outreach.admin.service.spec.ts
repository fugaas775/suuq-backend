import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AdminOutreachService } from './outreach.admin.service';
import { SupplyOutreachStatus } from './entities/supply-outreach-task.entity';
import { ProductRequest } from '../product-requests/entities/product-request.entity';
import { User } from '../users/entities/user.entity';

const mockRepo = () =>
  ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  }) as {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

describe('AdminOutreachService.createTask locations summary', () => {
  const tasksRepo = mockRepo();
  const requestRepo = mockRepo();
  const userRepo = mockRepo();

  const service = new AdminOutreachService(
    tasksRepo as any,
    requestRepo as any,
    userRepo as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles null city/country and sorts locations by count desc', async () => {
    const requests: Partial<ProductRequest>[] = [
      {
        id: 1,
        preferredCountry: 'ET',
        preferredCity: 'Addis',
        createdAt: new Date('2024-01-02'),
      },
      {
        id: 2,
        preferredCountry: 'ET',
        preferredCity: 'Addis',
        createdAt: new Date('2024-01-03'),
      },
      {
        id: 3,
        preferredCountry: undefined,
        preferredCity: undefined,
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 4,
        preferredCountry: 'KE',
        preferredCity: null,
        createdAt: new Date('2024-01-04'),
      },
    ];

    requestRepo.find.mockImplementation(async () => requests as any);
    tasksRepo.create.mockImplementation((v: any) => v);
    tasksRepo.save.mockImplementation(async (v: any) => ({ ...v, id: 10 }));
    tasksRepo.findOne.mockImplementation(
      async () => tasksRepo.save.mock.calls[0][0],
    );

    const payloadInput = { foo: 'bar' };

    const result = await service.createTask({
      term: 'books',
      requestIds: [1, 2, 3, 4],
      createdByAdminId: 99,
      note: undefined,
      payload: payloadInput,
    } as any);

    // The service returns findOne result; since we mocked findOne with a passthrough
    // the returned object is whatever save produced.
    const savedArg: any = tasksRepo.save.mock.calls[0][0];
    const locations = savedArg.payload.locations;

    expect(locations[0]).toEqual({ country: 'ET', city: 'Addis', count: 2 });
    expect(locations[0].count).toBeGreaterThanOrEqual(locations[1].count);
    expect(locations[1].count).toBeGreaterThanOrEqual(locations[2].count);
    expect(locations).toEqual(
      expect.arrayContaining([
        { country: 'ET', city: 'Addis', count: 2 },
        { country: 'KE', city: null, count: 1 },
        { country: null, city: null, count: 1 },
      ]),
    );

    expect(savedArg.payload.requestCount).toBe(4);
    expect(savedArg.payload.latestRequestAt.toISOString()).toBe(
      new Date('2024-01-04').toISOString(),
    );
    expect(savedArg.term).toBe('books');
    expect(savedArg.status).toBe(SupplyOutreachStatus.PENDING);
    expect(savedArg.requestIds).toEqual([1, 2, 3, 4]);
    expect(savedArg.payload.foo).toBe('bar');
  });
});
