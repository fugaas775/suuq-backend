import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BranchTransferStatus } from '../../branches/entities/branch-transfer.entity';
import {
  PosSyncStatus,
  PosSyncType,
} from '../../pos-sync/entities/pos-sync-job.entity';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { ReplenishmentPolicySubmissionMode } from '../../retail/dto/upsert-tenant-module-entitlement.dto';
import { SupplierOnboardingStatus } from '../../suppliers/entities/supplier-profile.entity';
import { AuditQueryDto } from './audit-query.dto';
import { BranchTransferQueryDto } from './branch-transfer-query.dto';
import { PosSyncJobQueryDto } from './pos-sync-job-query.dto';
import { PurchaseOrderQueryDto } from './purchase-order-query.dto';
import { PurchaseOrderReceiptEventQueryDto } from './purchase-order-receipt-event-query.dto';
import { SupplierReviewQueueQueryDto } from './supplier-review-queue-query.dto';

const validateDto = <T extends object>(cls: new () => T, input: object) => {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance as object);

  return { instance, errors };
};

const errorProperties = (errors: { property: string }[]) =>
  errors.map((error) => error.property);

describe('Admin B2B DTO validation', () => {
  describe('PurchaseOrderQueryDto', () => {
    it('transforms valid purchase-order review filters into typed values', () => {
      const { instance, errors } = validateDto(PurchaseOrderQueryDto, {
        branchId: '3',
        supplierProfileId: '14',
        status: PurchaseOrderStatus.DRAFT,
        autoReplenishment: 'true',
        autoReplenishmentSubmissionMode:
          ReplenishmentPolicySubmissionMode.AUTO_SUBMIT,
        autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        page: '2',
        limit: '10',
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          branchId: 3,
          supplierProfileId: 14,
          status: PurchaseOrderStatus.DRAFT,
          autoReplenishment: true,
          autoReplenishmentSubmissionMode:
            ReplenishmentPolicySubmissionMode.AUTO_SUBMIT,
          autoReplenishmentBlockedReason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
          page: 2,
          limit: 10,
        }),
      );
    });

    it('rejects malformed purchase-order review filters', () => {
      const { errors } = validateDto(PurchaseOrderQueryDto, {
        status: 'NOT_A_REAL_STATUS',
        autoReplenishmentSubmissionMode: 'NOT_A_REAL_MODE',
        page: '0',
        limit: '0',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'status',
          'autoReplenishmentSubmissionMode',
          'page',
          'limit',
        ]),
      );
    });

    it('normalizes autoReplenishment strings to booleans', () => {
      const { instance, errors } = validateDto(PurchaseOrderQueryDto, {
        autoReplenishment: 'false',
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          autoReplenishment: false,
        }),
      );
    });
  });

  describe('BranchTransferQueryDto', () => {
    it('transforms valid transfer review filters into typed values', () => {
      const { instance, errors } = validateDto(BranchTransferQueryDto, {
        fromBranchId: '3',
        toBranchId: '8',
        status: BranchTransferStatus.DISPATCHED,
        page: '2',
        limit: '10',
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          fromBranchId: 3,
          toBranchId: 8,
          status: BranchTransferStatus.DISPATCHED,
          page: 2,
          limit: 10,
        }),
      );
    });

    it('rejects malformed transfer review filters', () => {
      const { errors } = validateDto(BranchTransferQueryDto, {
        status: 'NOT_A_REAL_STATUS',
        page: '0',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining(['status', 'page']),
      );
    });
  });

  describe('PosSyncJobQueryDto', () => {
    it('transforms valid POS sync review filters into typed values', () => {
      const { instance, errors } = validateDto(PosSyncJobQueryDto, {
        branchId: '3',
        partnerCredentialId: '12',
        syncType: PosSyncType.STOCK_DELTA,
        status: PosSyncStatus.FAILED,
        failedOnly: 'true',
        page: '2',
        limit: '15',
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          branchId: 3,
          partnerCredentialId: 12,
          syncType: PosSyncType.STOCK_DELTA,
          status: PosSyncStatus.FAILED,
          failedOnly: true,
          page: 2,
          limit: 15,
        }),
      );
    });

    it('rejects malformed POS sync review filters', () => {
      const { errors } = validateDto(PosSyncJobQueryDto, {
        syncType: 'NOT_A_REAL_TYPE',
        status: 'NOT_A_REAL_STATUS',
        page: '0',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining(['syncType', 'status', 'page']),
      );
    });
  });

  describe('AuditQueryDto', () => {
    it('transforms valid audit helper filters into typed values', () => {
      const { instance, errors } = validateDto(AuditQueryDto, {
        page: '2',
        limit: '15',
        after: 'cursor_123',
        actions: 'STATUS_CHANGED',
        actorEmail: 'ops@example.com',
        actorId: '7',
        from: '2026-03-10T00:00:00.000Z',
        to: '2026-03-16T23:59:59.999Z',
        targetType: 'PURCHASE_ORDER',
        targetId: '42',
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          page: 2,
          limit: 15,
          after: 'cursor_123',
          actions: 'STATUS_CHANGED',
          actorEmail: 'ops@example.com',
          actorId: 7,
          from: '2026-03-10T00:00:00.000Z',
          to: '2026-03-16T23:59:59.999Z',
          targetType: 'PURCHASE_ORDER',
          targetId: 42,
        }),
      );
    });

    it('rejects malformed audit helper filters', () => {
      const { errors } = validateDto(AuditQueryDto, {
        page: '0',
        limit: 'abc',
        actorId: 'abc',
        from: 'not-a-date',
        to: 'also-not-a-date',
        targetId: 'abc',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'page',
          'limit',
          'actorId',
          'from',
          'to',
          'targetId',
        ]),
      );
    });
  });

  describe('PurchaseOrderReceiptEventQueryDto', () => {
    it('transforms valid receipt-event pagination into typed values', () => {
      const { instance, errors } = validateDto(
        PurchaseOrderReceiptEventQueryDto,
        {
          page: '2',
          limit: '10',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          page: 2,
          limit: 10,
        }),
      );
    });

    it('rejects malformed receipt-event pagination', () => {
      const { errors } = validateDto(PurchaseOrderReceiptEventQueryDto, {
        page: '0',
        limit: '0',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining(['page', 'limit']),
      );
    });
  });

  describe('SupplierReviewQueueQueryDto', () => {
    it('accepts valid supplier review statuses', () => {
      const { instance, errors } = validateDto(SupplierReviewQueueQueryDto, {
        status: SupplierOnboardingStatus.PENDING_REVIEW,
      });

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          status: SupplierOnboardingStatus.PENDING_REVIEW,
        }),
      );
    });

    it('rejects malformed supplier review statuses', () => {
      const { errors } = validateDto(SupplierReviewQueueQueryDto, {
        status: 'NOT_A_REAL_STATUS',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining(['status']),
      );
    });
  });
});
