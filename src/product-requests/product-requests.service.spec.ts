import { ProductRequestsService } from './product-requests.service';
import { UserRole } from '../auth/roles.enum';

describe('ProductRequestsService', () => {
  it('filters out soft-deleted requests in forwarded feed source SQL', async () => {
    const forwardRepo: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]),
    };

    const queryBuilder: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const requestRepo: any = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const service = new ProductRequestsService(
      requestRepo,
      {} as any,
      forwardRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { createAndDispatch: jest.fn() } as any,
      { sendProductRequestCreated: jest.fn() } as any,
    );

    await service.listForwardedToSeller(128, [UserRole.VENDOR], {} as any);

    expect(forwardRepo.query).toHaveBeenCalledTimes(2);

    const totalSql = String(forwardRepo.query.mock.calls[0][0]);
    const pageSql = String(forwardRepo.query.mock.calls[1][0]);

    expect(totalSql).toContain(
      'INNER JOIN product_request pr ON pr.id = f.request_id',
    );
    expect(totalSql).toContain('AND pr.deleted_at IS NULL');
    expect(pageSql).toContain(
      'INNER JOIN product_request pr ON pr.id = f.request_id',
    );
    expect(pageSql).toContain('AND pr.deleted_at IS NULL');
  });
});
