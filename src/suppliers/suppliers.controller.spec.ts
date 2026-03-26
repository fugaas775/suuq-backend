import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

describe('SuppliersController', () => {
  let controller: SuppliersController;
  let suppliersService: {
    findAll: jest.Mock;
    create: jest.Mock;
    updateStatus: jest.Mock;
    getProcurementSummary: jest.Mock;
    getProcurementTrend: jest.Mock;
    exportProcurementTrendCsv: jest.Mock;
  };

  beforeEach(async () => {
    suppliersService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1 }),
      getProcurementSummary: jest
        .fn()
        .mockResolvedValue({ supplierProfileId: 7 }),
      getProcurementTrend: jest
        .fn()
        .mockResolvedValue({ supplierProfileId: 7 }),
      exportProcurementTrendCsv: jest
        .fn()
        .mockResolvedValue('section,supplierProfileId\n"SUMMARY",7'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [{ provide: SuppliersService, useValue: suppliersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get(SuppliersController);
  });

  it('delegates procurement summaries to the suppliers service with actor context', async () => {
    await controller.procurementSummary(
      7,
      { windowDays: 30, limit: 5 },
      {
        user: {
          id: 8,
          email: 'supplier@example.com',
          roles: ['SUPPLIER_ACCOUNT'],
        },
      },
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

  it('delegates procurement trend queries to the suppliers service with actor context', async () => {
    await controller.procurementTrend(
      7,
      {
        branchIds: [3, 4],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        user: {
          id: 8,
          email: 'supplier@example.com',
          roles: ['SUPPLIER_ACCOUNT'],
        },
      },
    );

    expect(suppliersService.getProcurementTrend).toHaveBeenCalledWith(
      7,
      {
        branchIds: [3, 4],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 8,
        email: 'supplier@example.com',
        roles: ['SUPPLIER_ACCOUNT'],
      },
    );
  });

  it('exports procurement trends through the suppliers service with actor context', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.procurementTrendExport(
      7,
      {
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        user: {
          id: 8,
          email: 'supplier@example.com',
          roles: ['SUPPLIER_ACCOUNT'],
        },
      },
      res,
    );

    expect(suppliersService.exportProcurementTrendCsv).toHaveBeenCalledWith(
      7,
      {
        branchIds: [3],
        statuses: [PurchaseOrderStatus.RECEIVED],
        asOf: new Date('2026-03-19T12:00:00.000Z'),
      },
      {
        id: 8,
        email: 'supplier@example.com',
        roles: ['SUPPLIER_ACCOUNT'],
      },
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('supplier_procurement_trend_7_'),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith(
      'section,supplierProfileId\n"SUMMARY",7',
    );
  });
});
