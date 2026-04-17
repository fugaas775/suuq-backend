import { ConflictException, NotFoundException } from '@nestjs/common';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';
import { HospitalityKitchenTicket } from './entities/hospitality-kitchen-ticket.entity';
import { HospitalityTableBoard } from './entities/hospitality-table-board.entity';
import { HospitalityBillIntervention } from './entities/hospitality-bill-intervention.entity';
import { HospitalityIdempotencyKey } from './entities/hospitality-idempotency-key.entity';

describe('HospitalityWorkflowsService bill interventions', () => {
  let service: HospitalityWorkflowsService;
  let kitchenTicketRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let tableBoardRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let billInterventionRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let idempotencyRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    kitchenTicketRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => value),
    };

    tableBoardRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => ({ id: value.id ?? 91, ...value })),
      save: jest.fn(async (value) => ({
        createdAt: value.createdAt ?? new Date('2026-04-13T10:00:00.000Z'),
        updatedAt: value.updatedAt ?? new Date('2026-04-13T10:00:00.000Z'),
        ...value,
      })),
    };

    billInterventionRepo = {
      findOne: jest.fn(),
      create: jest.fn((value) => ({ id: value.id ?? 71, ...value })),
      save: jest.fn(async (value) => ({
        id: value.id ?? 71,
        createdAt: value.createdAt ?? new Date('2026-04-13T10:00:00.000Z'),
        updatedAt: value.updatedAt ?? new Date('2026-04-13T10:05:00.000Z'),
        ...value,
      })),
    };

    idempotencyRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => ({ id: value.id ?? 51, ...value })),
      save: jest.fn(async (value) => value),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest.fn(async (callback) =>
        callback({
          getRepository: jest.fn((entity) => {
            if (entity === HospitalityKitchenTicket) {
              return kitchenTicketRepo;
            }
            if (entity === HospitalityTableBoard) {
              return tableBoardRepo;
            }
            if (entity === HospitalityBillIntervention) {
              return billInterventionRepo;
            }
            if (entity === HospitalityIdempotencyKey) {
              return idempotencyRepo;
            }

            throw new Error(
              `Unexpected repository request: ${entity?.name || entity}`,
            );
          }),
        }),
      ),
    };

    service = new HospitalityWorkflowsService(
      kitchenTicketRepo as never,
      tableBoardRepo as never,
      billInterventionRepo as never,
      idempotencyRepo as never,
      auditService as never,
      dataSource as never,
    );
  });

  it('splits an open bill, records the intervention, and updates the table board', async () => {
    billInterventionRepo.findOne.mockResolvedValue(null);
    tableBoardRepo.findOne.mockResolvedValue(null);

    const result = await service.splitOpenBill(
      21,
      'check-4',
      {
        lineIds: ['line-1', 'line-2'],
        targetBillLabel: 'Patio Split',
        reason: 'Guest requested split payment',
        idempotencyKey: 'split-1',
        billLabel: 'Check 4',
        tableId: 't-7',
        tableLabel: 'Table 7',
        itemCount: 2,
        total: 88.5,
        currency: 'etb',
      },
      { id: 8, email: 'manager@suuq.test' },
    );

    expect(result).toMatchObject({
      status: 'SPLIT',
      branchId: 21,
      sourceBill: {
        billId: 'check-4',
        billLabel: 'Check 4',
        itemCount: 2,
        grandTotal: 88.5,
        currency: 'ETB',
      },
      targetBill: {
        billId: 'check-4-SPLIT-1',
        billLabel: 'Patio Split',
        itemCount: 2,
        grandTotal: 88.5,
        currency: 'ETB',
      },
      intervention: {
        actionType: 'SPLIT',
        lifecycleStatus: 'OPEN',
        total: 88.5,
      },
    });
    expect(tableBoardRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 21,
        tableId: 'T-7',
        tableLabel: 'Table 7',
        activeBills: expect.arrayContaining([
          expect.objectContaining({ billId: 'check-4', billLabel: 'Check 4' }),
          expect.objectContaining({
            billId: 'check-4-SPLIT-1',
            billLabel: 'Patio Split',
          }),
        ]),
      }),
    );
    expect(idempotencyRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 21,
        idempotencyKey: 'split-1',
        responsePayload: expect.objectContaining({ status: 'SPLIT' }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos.hospitality.bill.split',
        targetType: 'pos_hospitality_bill_intervention',
        meta: expect.objectContaining({
          branchId: 21,
          billId: 'check-4',
          targetBillId: 'check-4-SPLIT-1',
        }),
      }),
      expect.anything(),
    );
  });

  it('returns the recorded split response for duplicate idempotency keys without re-running the workflow', async () => {
    const existingResponse = {
      status: 'SPLIT',
      branchId: 21,
      sourceBill: {
        billId: 'check-4',
      },
      targetBill: {
        billId: 'check-4-SPLIT-1',
      },
    };
    idempotencyRepo.findOne.mockResolvedValueOnce({
      id: 51,
      branchId: 21,
      idempotencyKey: 'split-1',
      responsePayload: existingResponse,
    });

    const result = await service.splitOpenBill(
      21,
      'check-4',
      {
        lineIds: ['line-1'],
        idempotencyKey: 'split-1',
      },
      { id: 8, email: 'manager@suuq.test' },
    );

    expect(result).toEqual(existingResponse);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(billInterventionRepo.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('reopens a settled bill and returns receipt metadata for the lane', async () => {
    const currentIntervention = {
      id: 72,
      interventionId: 'bill-int-21-check-4',
      branchId: 21,
      billId: 'check-4',
      billLabel: 'Check 4',
      receiptId: 'rcpt-1',
      receiptNumber: 'RCPT-1',
      actionType: 'VOID',
      lifecycleStatus: 'SETTLED',
      serviceOwner: null,
      itemCount: 3,
      total: '45.00',
      currency: 'ETB',
      reason: 'Earlier intervention',
      priority: 'HIGH',
      actorUserId: 3,
      actorDisplayName: 'manager@suuq.test',
      version: 2,
      createdAt: new Date('2026-04-10T10:00:00.000Z'),
      updatedAt: new Date('2026-04-10T10:05:00.000Z'),
      tableId: null,
      tableLabel: null,
    };
    billInterventionRepo.findOne.mockResolvedValue(currentIntervention);

    const result = await service.reopenSettledBill(
      21,
      'check-4',
      {
        reason: 'Manager approved reopen after settlement correction',
        confirmed: true,
        idempotencyKey: 'reopen-1',
        billLabel: 'Check 4',
        receiptId: 'rcpt-1',
        receiptNumber: 'RCPT-1',
      },
      { id: 8, email: 'manager@suuq.test' },
    );

    expect(result).toMatchObject({
      status: 'UPDATED',
      branchId: 21,
      bill: {
        billId: 'check-4',
        billLabel: 'Check 4',
        lifecycleStatus: 'ACTIVE',
      },
      receipt: {
        receiptId: 'rcpt-1',
        receiptNumber: 'RCPT-1',
        lifecycleStatus: 'REOPENED',
      },
      intervention: {
        actionType: 'REOPEN',
        lifecycleStatus: 'REOPENED',
        version: 3,
      },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos.hospitality.bill.reopen',
        targetId: 72,
        meta: expect.objectContaining({
          branchId: 21,
          billId: 'check-4',
          receiptId: 'rcpt-1',
          receiptNumber: 'RCPT-1',
        }),
      }),
      expect.anything(),
    );
  });

  it('requires explicit confirmation before reopening a settled bill', async () => {
    await expect(
      service.reopenSettledBill(
        21,
        'check-4',
        {
          reason: 'Need another look',
          confirmed: false,
          idempotencyKey: 'reopen-confirmation',
        },
        { id: 8, email: 'manager@suuq.test' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects reopening a bill that has already been voided', async () => {
    billInterventionRepo.findOne.mockResolvedValue({
      id: 74,
      interventionId: 'bill-int-21-check-9',
      branchId: 21,
      billId: 'check-9',
      billLabel: 'Check 9',
      receiptId: 'rcpt-9',
      receiptNumber: 'RCPT-9',
      actionType: 'VOID',
      lifecycleStatus: 'VOIDED',
      serviceOwner: null,
      itemCount: 1,
      total: '14.00',
      currency: 'ETB',
      reason: 'Prior void',
      priority: 'CRITICAL',
      actorUserId: 5,
      actorDisplayName: 'lead@suuq.test',
      version: 1,
      createdAt: new Date('2026-04-10T10:00:00.000Z'),
      updatedAt: new Date('2026-04-10T10:05:00.000Z'),
      tableId: null,
      tableLabel: null,
    });

    await expect(
      service.reopenSettledBill(
        21,
        'check-9',
        {
          reason: 'Reopen after void',
          confirmed: true,
          idempotencyKey: 'reopen-voided',
        },
        { id: 8, email: 'manager@suuq.test' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('voids a settled bill and records the voided receipt lifecycle', async () => {
    const currentIntervention = {
      id: 73,
      interventionId: 'bill-int-21-check-8',
      branchId: 21,
      billId: 'check-8',
      billLabel: 'Check 8',
      receiptId: 'rcpt-8',
      receiptNumber: 'RCPT-8',
      actionType: 'REOPEN',
      lifecycleStatus: 'ACTIVE',
      serviceOwner: null,
      itemCount: 1,
      total: '65.50',
      currency: 'USD',
      reason: null,
      priority: 'HIGH',
      actorUserId: 4,
      actorDisplayName: 'lead@suuq.test',
      version: 4,
      createdAt: new Date('2026-04-10T10:00:00.000Z'),
      updatedAt: new Date('2026-04-10T10:05:00.000Z'),
      tableId: null,
      tableLabel: null,
    };
    billInterventionRepo.findOne.mockResolvedValue(currentIntervention);

    const result = await service.voidSettledBill(
      21,
      'check-8',
      {
        reason: 'Duplicate payment reversal',
        confirmed: true,
        idempotencyKey: 'void-1',
        billLabel: 'Check 8',
        receiptId: 'rcpt-8',
        receiptNumber: 'RCPT-8',
      },
      { id: 9, email: 'lead@suuq.test' },
    );

    expect(result).toMatchObject({
      status: 'UPDATED',
      branchId: 21,
      bill: {
        billId: 'check-8',
        billLabel: 'Check 8',
        lifecycleStatus: 'VOIDED',
      },
      receipt: {
        receiptId: 'rcpt-8',
        receiptNumber: 'RCPT-8',
        lifecycleStatus: 'VOIDED',
      },
      intervention: {
        actionType: 'VOID',
        lifecycleStatus: 'VOIDED',
        total: 65.5,
        currency: 'USD',
        version: 5,
      },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos.hospitality.bill.void',
        targetId: 73,
        meta: expect.objectContaining({
          branchId: 21,
          billId: 'check-8',
          receiptId: 'rcpt-8',
          receiptNumber: 'RCPT-8',
        }),
      }),
      expect.anything(),
    );
  });

  it('requires explicit confirmation before voiding a settled bill', async () => {
    await expect(
      service.voidSettledBill(
        21,
        'check-8',
        {
          reason: 'Duplicate payment reversal',
          confirmed: false,
          idempotencyKey: 'void-confirmation',
        },
        { id: 9, email: 'lead@suuq.test' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
