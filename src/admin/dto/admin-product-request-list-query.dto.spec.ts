import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProductRequestStatus } from '../../product-requests/entities/product-request.entity';
import { AdminProductRequestListQueryDto } from './admin-product-request-list-query.dto';

describe('AdminProductRequestListQueryDto', () => {
  it('transforms valid status and limit filters', () => {
    const dto = plainToInstance(AdminProductRequestListQueryDto, {
      status: 'open, in_progress',
      limit: '25',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        status: [ProductRequestStatus.OPEN, ProductRequestStatus.IN_PROGRESS],
        limit: 25,
      }),
    );
  });

  it('rejects malformed status and limit filters', () => {
    const dto = plainToInstance(AdminProductRequestListQueryDto, {
      status: 'NOT_REAL',
      limit: 'abc',
    });

    const errors = validateSync(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['status', 'limit']),
    );
  });
});
