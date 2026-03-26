import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminCreditUsersQueryDto } from './admin-credit-users-query.dto';
import { AdminSubscriptionRequestsQueryDto } from './admin-subscription-requests-query.dto';
import { AdminUserListQueryDto } from './admin-user-list-query.dto';
import { AdminUsersPageQueryDto } from './admin-users-page-query.dto';

describe('Admin users and credit DTO validation', () => {
  it('transforms valid admin user pagination and request filters', () => {
    const activeDto = plainToInstance(AdminUsersPageQueryDto, {
      page: '2',
      limit: '25',
    });
    const requestsDto = plainToInstance(AdminSubscriptionRequestsQueryDto, {
      page: '3',
      limit: '15',
      status: 'approved',
    });
    const listDto = plainToInstance(AdminUserListQueryDto, {
      page: '4',
      limit: '50',
      meta: '1',
      q: 'vendor',
    });

    expect(validateSync(activeDto)).toHaveLength(0);
    expect(validateSync(requestsDto)).toHaveLength(0);
    expect(validateSync(listDto)).toHaveLength(0);
    expect(activeDto).toEqual(expect.objectContaining({ page: 2, limit: 25 }));
    expect(requestsDto).toEqual(
      expect.objectContaining({ page: 3, limit: 15, status: 'APPROVED' }),
    );
    expect(listDto).toEqual(
      expect.objectContaining({ page: 4, limit: 50, meta: '1', q: 'vendor' }),
    );
  });

  it('transforms valid admin credit list filters', () => {
    const dto = plainToInstance(AdminCreditUsersQueryDto, {
      page: '2',
      limit: '30',
      search: '  acme  ',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({ page: 2, limit: 30, search: 'acme' }),
    );
  });

  it('rejects malformed admin user and credit query filters', () => {
    const activeDto = plainToInstance(AdminUsersPageQueryDto, {
      page: 'abc',
      limit: '0',
    });
    const requestsDto = plainToInstance(AdminSubscriptionRequestsQueryDto, {
      status: 'soon',
    });
    const listDto = plainToInstance(AdminUserListQueryDto, {
      meta: 'yes',
    });
    const creditDto = plainToInstance(AdminCreditUsersQueryDto, {
      page: '0',
      limit: 'abc',
    });

    expect(validateSync(activeDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
    expect(validateSync(requestsDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['status']),
    );
    expect(validateSync(listDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['meta']),
    );
    expect(validateSync(creditDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
  });
});
