import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminProductLeafSubcategoryQueryDto } from './admin-product-leaf-subcategory-query.dto';
import { AdminProductListQueryDto } from './admin-product-list-query.dto';

describe('Admin product DTO validation', () => {
  it('transforms valid product list filters', () => {
    const dto = plainToInstance(AdminProductListQueryDto, {
      status: 'pending_approval',
      page: '2',
      per_page: '25',
      q: '  acme  ',
      featured: 'true',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        status: 'pending_approval',
        page: 2,
        per_page: 25,
        q: 'acme',
        featured: true,
      }),
    );
  });

  it('rejects malformed product list filters', () => {
    const dto = plainToInstance(AdminProductListQueryDto, {
      page: 'abc',
      per_page: '0',
      featured: 'not-real',
    });

    const errors = validateSync(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'per_page', 'featured']),
    );
  });

  it('transforms valid leaf-subcategory filters', () => {
    const dto = plainToInstance(AdminProductLeafSubcategoryQueryDto, {
      parentId: '17',
      q: '  milk  ',
      limit: '300',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        parentId: 17,
        q: 'milk',
        limit: 300,
      }),
    );
  });

  it('rejects malformed leaf-subcategory filters', () => {
    const dto = plainToInstance(AdminProductLeafSubcategoryQueryDto, {
      parentId: 'abc',
      limit: '5000',
    });

    const errors = validateSync(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['parentId', 'limit']),
    );
  });
});
