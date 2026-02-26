import { CreatedSort } from '../../sorting/created.sort';

describe('CreatedSort', () => {
  it('only orders by geo fields when geoPriority is enabled', () => {
    const orderBy = jest.fn().mockReturnThis();
    const addOrderBy = jest.fn().mockReturnThis();
    const qb: any = { orderBy, addOrderBy };

    new CreatedSort().apply(qb, {
      geoPriority: false,
      geoRotationSeed: 'seed',
    } as any);

    expect(orderBy).not.toHaveBeenCalledWith('geo_rank', 'DESC');
    expect(addOrderBy).not.toHaveBeenCalledWith('geo_rank', 'DESC');
    expect(addOrderBy).not.toHaveBeenCalledWith('geo_rotation_rank', 'ASC');
    expect(addOrderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
  });

  it('applies geo ordering when geoPriority is enabled', () => {
    const orderBy = jest.fn().mockReturnThis();
    const addOrderBy = jest.fn().mockReturnThis();
    const qb: any = { orderBy, addOrderBy };

    new CreatedSort().apply(qb, {
      geoPriority: true,
      geoRotationSeed: 'seed',
    } as any);

    expect(orderBy).toHaveBeenCalledWith('geo_rank', 'DESC');
    expect(addOrderBy).toHaveBeenCalledWith('geo_rank', 'DESC');
    expect(addOrderBy).toHaveBeenCalledWith('geo_rotation_rank', 'ASC');
    expect(addOrderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
  });
});
