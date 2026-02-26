import { BestMatchSort } from '../../sorting/best-match.sort';

describe('BestMatchSort', () => {
  it('compiles and can be constructed', () => {
    expect(typeof BestMatchSort).toBe('function');
  });

  it('uses entity property paths for ordering to avoid metadata resolution issues', () => {
    const orderBy = jest.fn().mockReturnThis();
    const addOrderBy = jest.fn().mockReturnThis();
    const qb: any = { orderBy, addOrderBy };

    new BestMatchSort().apply(qb, { geoPriority: true } as any);

    expect(orderBy).toHaveBeenCalledWith('geo_rank', 'DESC');
    expect(addOrderBy).toHaveBeenCalledWith(
      'product.salesCount',
      'DESC',
      'NULLS LAST',
    );
    expect(addOrderBy).toHaveBeenCalledWith(
      'product.averageRating',
      'DESC',
      'NULLS LAST',
    );
    expect(addOrderBy).toHaveBeenCalledWith(
      'product.ratingCount',
      'DESC',
      'NULLS LAST',
    );
    expect(addOrderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
  });
});
