import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminAdsAuditQueryDto } from './admin-ads-audit-query.dto';

describe('Admin ads audit DTO validation', () => {
  it('transforms valid audit filters', () => {
    const dto = plainToInstance(AdminAdsAuditQueryDto, {
      state: ' Active ',
      page: '2',
      per_page: '25',
      q: '  boost  ',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        state: 'active',
        page: 2,
        per_page: 25,
        q: 'boost',
      }),
    );
  });

  it('rejects malformed audit filters', () => {
    const dto = plainToInstance(AdminAdsAuditQueryDto, {
      state: 'soon',
      page: 'abc',
      per_page: '500',
    });

    const errors = validateSync(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['state', 'page', 'per_page']),
    );
  });
});
