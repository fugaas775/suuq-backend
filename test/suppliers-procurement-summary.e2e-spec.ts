import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { SuppliersController } from '../src/suppliers/suppliers.controller';
import { SuppliersService } from '../src/suppliers/suppliers.service';

describe('SuppliersController procurement summary (e2e)', () => {
  let app: INestApplication;
  let suppliersService: {
    findAll: jest.Mock;
    create: jest.Mock;
    updateStatus: jest.Mock;
    getProcurementSummary: jest.Mock;
    getProcurementTrend: jest.Mock;
    exportProcurementTrendCsv: jest.Mock;
  };

  beforeAll(async () => {
    suppliersService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1 }),
      getProcurementSummary: jest.fn().mockResolvedValue({
        supplierProfileId: 7,
        companyName: 'Acme Supply',
        onboardingStatus: 'APPROVED',
        isActive: true,
        windowDays: 30,
        totalOrders: 2,
        activeOrderCount: 2,
        statusCounts: [{ status: 'SUBMITTED', count: 1 }],
        workQueues: {
          pendingAcknowledgementCount: 1,
          pendingShipmentCount: 0,
          pendingReceiptAcknowledgementCount: 1,
          openDiscrepancyCount: 1,
          awaitingApprovalDiscrepancyCount: 0,
        },
        sla: {
          averageAcknowledgementHours: 2,
          averageShipmentLatencyHours: 22,
          averageReceiptAcknowledgementHours: 4,
          fillRatePercent: 80,
          shortageRatePercent: 10,
          damageRatePercent: 10,
        },
        recentOrders: [
          {
            purchaseOrderId: 42,
            orderNumber: 'PO-42',
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            status: 'SUBMITTED',
            total: 50,
            currency: 'USD',
            expectedDeliveryDate: null,
            submittedAt: '2026-03-15T08:00:00.000Z',
            acknowledgedAt: null,
            shippedAt: null,
            receivedAt: null,
            pendingReceiptAcknowledgementCount: 1,
            openDiscrepancyCount: 1,
            awaitingApprovalDiscrepancyCount: 0,
            acknowledgementHours: null,
            shipmentLatencyHours: null,
          },
        ],
      }),
      getProcurementTrend: jest.fn().mockResolvedValue({
        supplierProfileId: 7,
        companyName: 'Acme Supply',
        onboardingStatus: 'APPROVED',
        isActive: true,
        generatedAt: '2026-03-19T12:00:00.000Z',
        asOf: '2026-03-19T12:00:00.000Z',
        trendDirection: 'IMPROVING',
        scoreDeltaFrom90d: 18.5,
        fillRateDeltaFrom90d: 12,
        appliedFilters: {
          branchIds: [4],
          statuses: ['RECEIVED'],
          asOf: '2026-03-19T12:00:00.000Z',
        },
        windows: [
          {
            windowDays: 7,
            procurementScore: 98,
            scoreBreakdown: {
              fillRateScore: 100,
              acknowledgementScore: 100,
              shipmentScore: 100,
              receiptAcknowledgementScore: 100,
              discrepancyScore: 100,
              discrepancyPenalty: 0,
            },
            totalOrders: 3,
            activeOrderCount: 1,
            fillRatePercent: 100,
            averageAcknowledgementHours: 1,
            averageShipmentLatencyHours: 6,
            averageReceiptAcknowledgementHours: 1,
            pendingAcknowledgementCount: 0,
            pendingShipmentCount: 0,
            pendingReceiptAcknowledgementCount: 0,
            openDiscrepancyCount: 0,
          },
        ],
        branchBuckets: [
          {
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            procurementScore: 91.5,
            trendDirection: 'IMPROVING',
            scoreDeltaFrom90d: 18.5,
            fillRateDeltaFrom90d: 12,
            impactScore: 65,
            impactSharePercent: 100,
            orderCount: 2,
            discrepancyEventCount: 1,
            openDiscrepancyCount: 1,
            fillRatePercent: 80,
            averageAcknowledgementHours: 5,
            averageShipmentLatencyHours: 30,
            averageReceiptAcknowledgementHours: 2,
          },
        ],
        topContributingOrders: [
          {
            purchaseOrderId: 42,
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            orderNumber: 'PO-42',
            status: 'RECEIVED',
            createdAt: '2026-03-15T08:00:00.000Z',
            impactScore: 34,
            fillRatePercent: 80,
            shortageQuantity: 1,
            damagedQuantity: 1,
            acknowledgementHours: 5,
            shipmentLatencyHours: 30,
            dominantIssue: 'LOW_FILL_RATE',
          },
        ],
        topDiscrepancyEvents: [
          {
            receiptEventId: 9,
            purchaseOrderId: 42,
            branchId: 4,
            branchName: 'Bole',
            branchCode: 'BOLE',
            orderNumber: 'PO-42',
            discrepancyStatus: 'OPEN',
            createdAt: '2026-03-17T08:00:00.000Z',
            impactScore: 31,
            shortageQuantity: 1,
            damagedQuantity: 1,
            supplierAcknowledgedAt: '2026-03-17T10:00:00.000Z',
            note: 'Short shipment noted',
          },
        ],
      }),
      exportProcurementTrendCsv: jest
        .fn()
        .mockResolvedValue('section,supplierProfileId\n"SUMMARY",7'),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [{ provide: SuppliersService, useValue: suppliersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            id: 8,
            email: 'supplier@example.com',
            roles: ['SUPPLIER_ACCOUNT'],
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a supplier procurement summary with parsed query params', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers/v1/profiles/7/procurement-summary')
      .query({ windowDays: 30, limit: 5 })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        totalOrders: 2,
        workQueues: expect.objectContaining({
          pendingAcknowledgementCount: 1,
        }),
      }),
    );
    expect(suppliersService.getProcurementSummary).toHaveBeenCalledWith(
      7,
      { windowDays: 30, limit: 5 },
      {
        id: 8,
        email: 'supplier@example.com',
        roles: ['SUPPLIER_ACCOUNT'],
      },
    );
  });

  it('returns a supplier procurement trend with parsed query params', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers/v1/profiles/7/procurement-trend')
      .query({
        branchIds: '4',
        statuses: 'RECEIVED',
        asOf: '2026-03-19T12:00:00.000Z',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        supplierProfileId: 7,
        trendDirection: 'IMPROVING',
        appliedFilters: expect.objectContaining({
          branchIds: [4],
          statuses: ['RECEIVED'],
        }),
        branchBuckets: expect.arrayContaining([
          expect.objectContaining({
            branchId: 4,
            branchName: 'Bole',
            trendDirection: 'IMPROVING',
          }),
        ]),
        topContributingOrders: expect.arrayContaining([
          expect.objectContaining({ purchaseOrderId: 42, branchId: 4 }),
        ]),
        topDiscrepancyEvents: expect.arrayContaining([
          expect.objectContaining({ receiptEventId: 9, branchId: 4 }),
        ]),
        windows: expect.arrayContaining([
          expect.objectContaining({ windowDays: 7, procurementScore: 98 }),
        ]),
      }),
    );
    expect(suppliersService.getProcurementTrend).toHaveBeenCalledWith(
      7,
      {
        branchIds: [4],
        statuses: ['RECEIVED'],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 8,
        email: 'supplier@example.com',
        roles: ['SUPPLIER_ACCOUNT'],
      },
    );
  });

  it('exports a supplier procurement trend as CSV with parsed query params', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers/v1/profiles/7/procurement-trend/export')
      .query({
        branchIds: '4',
        statuses: 'RECEIVED',
        asOf: '2026-03-19T12:00:00.000Z',
      })
      .expect(200);

    expect(response.text).toContain('section,supplierProfileId');
    expect(suppliersService.exportProcurementTrendCsv).toHaveBeenCalledWith(
      7,
      {
        branchIds: [4],
        statuses: ['RECEIVED'],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 8,
        email: 'supplier@example.com',
        roles: ['SUPPLIER_ACCOUNT'],
      },
    );
  });
});
