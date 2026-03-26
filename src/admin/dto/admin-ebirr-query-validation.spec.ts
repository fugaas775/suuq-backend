import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminEbirrReconcileReportQueryDto } from './admin-ebirr-reconcile-report-query.dto';
import { AdminEbirrTransactionsQueryDto } from './admin-ebirr-transactions-query.dto';

describe('Admin Ebirr DTO validation', () => {
  it('transforms valid transaction list filters', () => {
    const dto = plainToInstance(AdminEbirrTransactionsQueryDto, {
      page: '2',
      limit: '75',
      search: '  BOOST-17  ',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 75,
        search: 'BOOST-17',
      }),
    );
  });

  it('transforms valid initiated reconcile report filters', () => {
    const dto = plainToInstance(AdminEbirrReconcileReportQueryDto, {
      olderThanMinutes: '45',
      limit: '150',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        olderThanMinutes: 45,
        limit: 150,
      }),
    );
  });

  it('rejects malformed Ebirr query filters', () => {
    const txDto = plainToInstance(AdminEbirrTransactionsQueryDto, {
      page: 'abc',
      limit: '0',
    });
    const reportDto = plainToInstance(AdminEbirrReconcileReportQueryDto, {
      olderThanMinutes: '0',
      limit: '999',
    });

    expect(validateSync(txDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
    expect(validateSync(reportDto).map((error) => error.property)).toEqual(
      expect.arrayContaining(['olderThanMinutes', 'limit']),
    );
  });
});
