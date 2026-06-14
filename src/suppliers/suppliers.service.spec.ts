import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SupplierOnboardingStatus } from './entities/supplier-profile.entity';

function makeService({
  repo = {},
  audit = { log: jest.fn() },
} = {}): SuppliersService {
  return new SuppliersService(repo as any, audit as any);
}

describe('SuppliersService', () => {
  describe('createForUser', () => {
    it('requires an authenticated user', async () => {
      const service = makeService();
      await expect(
        service.createForUser(null, { companyName: 'X' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a duplicate profile', async () => {
      const repo = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
      const service = makeService({ repo });
      await expect(
        service.createForUser(7, { companyName: 'X' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a DRAFT profile bound to the user', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: (v: any) => v,
        save: jest.fn(async (v: any) => ({ id: 10, ...v })),
      };
      const service = makeService({ repo });
      const result = await service.createForUser(7, {
        companyName: 'Acme',
        countriesServed: ['ET'],
      });
      expect(result.userId).toBe(7);
      expect(result.onboardingStatus).toBe(SupplierOnboardingStatus.DRAFT);
      expect(result.companyName).toBe('Acme');
    });
  });

  describe('updateForUser', () => {
    it('blocks edits once pending review', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          userId: 7,
          onboardingStatus: 'PENDING_REVIEW',
        }),
      };
      const service = makeService({ repo });
      await expect(
        service.updateForUser(7, { companyName: 'New' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists provided fields while draft', async () => {
      const profile = {
        id: 1,
        userId: 7,
        onboardingStatus: 'DRAFT',
        companyName: 'Old',
      };
      const repo = {
        findOne: jest.fn().mockResolvedValue(profile),
        save: jest.fn(async (v: any) => v),
      };
      const service = makeService({ repo });
      const result = await service.updateForUser(7, { companyName: 'New' });
      expect(result.companyName).toBe('New');
    });
  });

  describe('submitForReview', () => {
    it('moves a DRAFT to PENDING_REVIEW', async () => {
      const profile = { id: 1, userId: 7, onboardingStatus: 'DRAFT' };
      const repo = {
        findOne: jest.fn().mockResolvedValue(profile),
        save: jest.fn(async (v: any) => v),
      };
      const service = makeService({ repo });
      const result = await service.submitForReview(7);
      expect(result.onboardingStatus).toBe(
        SupplierOnboardingStatus.PENDING_REVIEW,
      );
    });

    it('refuses to submit an already-approved profile', async () => {
      const repo = {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          userId: 7,
          onboardingStatus: 'APPROVED',
        }),
      };
      const service = makeService({ repo });
      await expect(service.submitForReview(7)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('approve / reject', () => {
    it('approves a pending profile and writes an audit entry', async () => {
      const profile = { id: 5, onboardingStatus: 'PENDING_REVIEW' };
      const repo = {
        findOne: jest.fn().mockResolvedValue(profile),
        save: jest.fn(async (v: any) => v),
      };
      const audit = { log: jest.fn() };
      const service = makeService({ repo, audit });
      const result = await service.approve(5, { id: 1, email: 'a@b.c' });
      expect(result.onboardingStatus).toBe(SupplierOnboardingStatus.APPROVED);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supplier_profile.approved',
          targetId: 5,
        }),
      );
    });

    it('refuses to approve a non-pending profile', async () => {
      const repo = {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 5, onboardingStatus: 'DRAFT' }),
      };
      const service = makeService({ repo });
      await expect(service.approve(5, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a pending profile with the supplied reason', async () => {
      const profile = { id: 5, onboardingStatus: 'PENDING_REVIEW' };
      const audit = { log: jest.fn() };
      const repo = {
        findOne: jest.fn().mockResolvedValue(profile),
        save: jest.fn(async (v: any) => v),
      };
      const service = makeService({ repo, audit });
      const result = await service.reject(
        5,
        { reason: 'bad tax id' },
        { id: 1 },
      );
      expect(result.onboardingStatus).toBe(SupplierOnboardingStatus.REJECTED);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supplier_profile.rejected',
          reason: 'bad tax id',
        }),
      );
    });

    it('throws NotFound for an unknown profile', async () => {
      const repo = { findOne: jest.fn().mockResolvedValue(null) };
      const service = makeService({ repo });
      await expect(service.approve(99, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
