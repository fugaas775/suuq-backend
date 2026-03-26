import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminVendorListQueryDto } from './admin-vendor-list-query.dto';
import { AdminVendorSearchQueryDto } from './admin-vendor-search-query.dto';

const validateDto = <T extends object>(cls: new () => T, input: object) => {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance as object);

  return { instance, errors };
};

const errorProperties = (errors: { property: string }[]) =>
  errors.map((error) => error.property);

describe('Admin vendor DTO validation', () => {
  describe('AdminVendorListQueryDto', () => {
    it('transforms valid vendor list filters', () => {
      const { instance, errors } = validateDto(AdminVendorListQueryDto, {
        page: '2',
        limit: '50',
        q: '  acme  ',
        search: '  supply  ',
        vendorId: '7',
        sort: 'verifiedAt',
        verificationStatus: 'APPROVED',
        certificationStatus: 'certified',
        country: ' ET ',
        region: ' Addis ',
        city: ' Bole ',
        subscriptionTier: 'pro',
        minSales: '100',
        minRating: '4.5',
        meta: '1',
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          page: 2,
          limit: 50,
          q: 'acme',
          search: 'supply',
          vendorId: 7,
          sort: 'verifiedAt',
          verificationStatus: 'APPROVED',
          certificationStatus: 'certified',
          country: 'ET',
          region: 'Addis',
          city: 'Bole',
          subscriptionTier: 'pro',
          minSales: 100,
          minRating: 4.5,
          meta: '1',
        }),
      );
    });

    it('rejects malformed vendor list filters', () => {
      const { errors } = validateDto(AdminVendorListQueryDto, {
        page: '0',
        limit: '500',
        vendorId: 'abc',
        sort: 'unknown',
        verificationStatus: 'INVALID',
        meta: '0',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'page',
          'limit',
          'vendorId',
          'sort',
          'verificationStatus',
          'meta',
        ]),
      );
    });
  });

  describe('AdminVendorSearchQueryDto', () => {
    it('transforms valid admin vendor search filters', () => {
      const { instance, errors } = validateDto(AdminVendorSearchQueryDto, {
        q: '  acme  ',
        certificationStatus: 'certified',
        subscriptionTier: 'pro',
        limit: '25',
        meta: '1',
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          q: 'acme',
          certificationStatus: 'certified',
          subscriptionTier: 'pro',
          limit: 25,
          meta: '1',
        }),
      );
    });

    it('rejects malformed admin vendor search filters', () => {
      const { errors } = validateDto(AdminVendorSearchQueryDto, {
        certificationStatus: 'INVALID',
        subscriptionTier: 'gold',
        limit: '0',
        meta: '0',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'certificationStatus',
          'subscriptionTier',
          'limit',
          'meta',
        ]),
      );
    });
  });
});
