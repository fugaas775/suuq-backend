import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import {
  ActOnSupplierProcurementBranchInterventionDto,
  SupplierProcurementBranchInterventionAction,
} from './act-on-supplier-procurement-branch-intervention.dto';
import {
  SupplierProcurementDashboardBranchRollupSortBy,
  SupplierProcurementDashboardSupplierRollupSortBy,
  SupplierProcurementBranchInterventionDashboardQueryDto,
} from './supplier-procurement-branch-intervention-dashboard-query.dto';
import {
  SupplierProcurementBranchInterventionAgeBucket,
  SupplierProcurementBranchInterventionQueryDto,
  SupplierProcurementBranchInterventionSortBy,
} from './supplier-procurement-branch-intervention-query.dto';
import { SupplierProcurementBranchInterventionDetailQueryDto } from './supplier-procurement-branch-intervention-detail-query.dto';
import { SupplierProcurementScorecardQueryDto } from './supplier-procurement-scorecard-query.dto';
import { SupplierProcurementTrendQueryDto } from './supplier-procurement-trend-query.dto';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';

const validateDto = <T extends object>(cls: new () => T, input: object) => {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance as object);

  return { instance, errors };
};

const errorProperties = (errors: { property: string }[]) =>
  errors.map((error) => error.property);

describe('Supplier procurement DTO validation', () => {
  describe('SupplierProcurementScorecardQueryDto', () => {
    it('transforms valid scorecard filters into typed values', () => {
      const { instance, errors } = validateDto(
        SupplierProcurementScorecardQueryDto,
        {
          windowDays: '30',
          limit: '15',
          includeInactive: 'false',
          onboardingStatus: SupplierOnboardingStatus.APPROVED,
          supplierProfileIds: '7,9',
          branchIds: '3,4',
          statuses: 'SUBMITTED,RECEIVED',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-19T23:59:59.999Z',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          windowDays: 30,
          limit: 15,
          includeInactive: false,
          onboardingStatus: SupplierOnboardingStatus.APPROVED,
          supplierProfileIds: [7, 9],
          branchIds: [3, 4],
          statuses: [
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.RECEIVED,
          ],
          from: new Date('2026-03-01T00:00:00.000Z'),
          to: new Date('2026-03-19T23:59:59.999Z'),
        }),
      );
    });

    it('rejects malformed scorecard enum, id, and date filters', () => {
      const { errors } = validateDto(SupplierProcurementScorecardQueryDto, {
        supplierProfileIds: 'abc',
        branchIds: '3,0',
        statuses: 'NOT_A_REAL_STATUS',
        from: 'not-a-date',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'supplierProfileIds',
          'branchIds',
          'statuses',
          'from',
        ]),
      );
    });
  });

  describe('SupplierProcurementBranchInterventionQueryDto', () => {
    it('transforms valid intervention queue filters into typed values', () => {
      const { instance, errors } = validateDto(
        SupplierProcurementBranchInterventionQueryDto,
        {
          supplierProfileIds: '7',
          branchIds: '3',
          statuses: 'RECEIVED',
          latestActions: 'ASSIGN',
          actionAgeBuckets: 'OVER_24H',
          sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
          assigneeUserIds: '21,34',
          includeUntriaged: 'false',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          supplierProfileIds: [7],
          branchIds: [3],
          statuses: [PurchaseOrderStatus.RECEIVED],
          latestActions: [SupplierProcurementBranchInterventionAction.ASSIGN],
          actionAgeBuckets: [
            SupplierProcurementBranchInterventionAgeBucket.OVER_24H,
          ],
          sortBy: SupplierProcurementBranchInterventionSortBy.STALE_FIRST,
          assigneeUserIds: [21, 34],
          includeUntriaged: false,
        }),
      );
    });

    it('rejects malformed intervention queue filters', () => {
      const { errors } = validateDto(
        SupplierProcurementBranchInterventionQueryDto,
        {
          latestActions: 'NOT_A_REAL_ACTION',
          actionAgeBuckets: 'OLDER_THAN_FOREVER',
          assigneeUserIds: 'abc',
          sortBy: 'NOT_A_REAL_SORT',
        },
      );

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'latestActions',
          'actionAgeBuckets',
          'assigneeUserIds',
          'sortBy',
        ]),
      );
    });
  });

  describe('SupplierProcurementBranchInterventionDashboardQueryDto', () => {
    it('transforms valid dashboard rollup options into typed values', () => {
      const { instance, errors } = validateDto(
        SupplierProcurementBranchInterventionDashboardQueryDto,
        {
          supplierRollupSortBy:
            SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
          branchRollupSortBy:
            SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
          supplierRollupLimit: '5',
          branchRollupLimit: '3',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          supplierRollupSortBy:
            SupplierProcurementDashboardSupplierRollupSortBy.UNTRIAGED_DESC,
          branchRollupSortBy:
            SupplierProcurementDashboardBranchRollupSortBy.INTERVENTION_COUNT_DESC,
          supplierRollupLimit: 5,
          branchRollupLimit: 3,
        }),
      );
    });

    it('rejects malformed dashboard rollup options', () => {
      const { errors } = validateDto(
        SupplierProcurementBranchInterventionDashboardQueryDto,
        {
          supplierRollupSortBy: 'NOT_A_REAL_SORT',
          branchRollupSortBy: 'NOT_A_REAL_SORT',
          supplierRollupLimit: '0',
          branchRollupLimit: '101',
        },
      );

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'supplierRollupSortBy',
          'branchRollupSortBy',
          'supplierRollupLimit',
          'branchRollupLimit',
        ]),
      );
    });
  });

  describe('SupplierProcurementBranchInterventionDetailQueryDto', () => {
    it('rejects malformed intervention detail filters', () => {
      const { errors } = validateDto(
        SupplierProcurementBranchInterventionDetailQueryDto,
        {
          statuses: 'NOT_A_REAL_STATUS',
          from: 'invalid-date',
          to: 'also-invalid',
        },
      );

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining(['statuses', 'from', 'to']),
      );
    });
  });

  describe('SupplierProcurementTrendQueryDto', () => {
    it('transforms valid trend filters into typed values', () => {
      const { instance, errors } = validateDto(
        SupplierProcurementTrendQueryDto,
        {
          branchIds: '3,4',
          statuses: 'RECEIVED',
          asOf: '2026-03-19T12:00:00.000Z',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          branchIds: [3, 4],
          statuses: [PurchaseOrderStatus.RECEIVED],
          asOf: new Date('2026-03-19T12:00:00.000Z'),
        }),
      );
    });

    it('rejects malformed trend filters', () => {
      const { errors } = validateDto(SupplierProcurementTrendQueryDto, {
        branchIds: 'abc',
        statuses: 'NOT_A_REAL_STATUS',
        asOf: 'not-a-date',
      });

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining(['branchIds', 'statuses', 'asOf']),
      );
    });
  });

  describe('ActOnSupplierProcurementBranchInterventionDto', () => {
    it('accepts valid intervention actions', () => {
      const { instance, errors } = validateDto(
        ActOnSupplierProcurementBranchInterventionDto,
        {
          action: SupplierProcurementBranchInterventionAction.ASSIGN,
          note: 'Ops lead taking ownership',
          assigneeUserId: '21',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          action: SupplierProcurementBranchInterventionAction.ASSIGN,
          note: 'Ops lead taking ownership',
          assigneeUserId: 21,
        }),
      );
    });

    it('rejects malformed intervention actions', () => {
      const { errors } = validateDto(
        ActOnSupplierProcurementBranchInterventionDto,
        {
          action: 'INVALID_ACTION',
          assigneeUserId: '0',
          note: 'x'.repeat(501),
        },
      );

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining(['action', 'assigneeUserId', 'note']),
      );
    });
  });
});
