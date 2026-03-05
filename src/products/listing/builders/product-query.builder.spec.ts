import { ProductQueryBuilder } from './product-query.builder';

describe('ProductQueryBuilder', () => {
  it('applies soft-delete guard in base query', () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    new ProductQueryBuilder(qb);

    expect(qb.where).toHaveBeenCalledWith('product.status = :status', {
      status: 'publish',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('product.isBlocked = false');
    expect(qb.andWhere).toHaveBeenCalledWith('product.deleted_at IS NULL');
  });
});
