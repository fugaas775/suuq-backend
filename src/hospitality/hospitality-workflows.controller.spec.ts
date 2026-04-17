import { HospitalityWorkflowsController } from './hospitality-workflows.controller';
import { HospitalityWorkflowsService } from './hospitality-workflows.service';

describe('HospitalityWorkflowsController bill endpoints', () => {
  let controller: HospitalityWorkflowsController;
  let hospitalityWorkflowsService: {
    splitOpenBill: jest.Mock;
    reopenSettledBill: jest.Mock;
    voidSettledBill: jest.Mock;
  };

  beforeEach(() => {
    hospitalityWorkflowsService = {
      splitOpenBill: jest.fn(),
      reopenSettledBill: jest.fn(),
      voidSettledBill: jest.fn(),
    };

    controller = new HospitalityWorkflowsController(
      hospitalityWorkflowsService as unknown as HospitalityWorkflowsService,
    );
  });

  it('delegates split bill requests with the authenticated actor', async () => {
    hospitalityWorkflowsService.splitOpenBill.mockResolvedValue({
      status: 'SPLIT',
    });

    await controller.splitOpenBill(
      '21',
      'check-4',
      {
        lineIds: ['line-1', 'line-2'],
        targetBillLabel: 'Patio Split',
        reason: 'Guest requested split payment',
        idempotencyKey: 'split-1',
      },
      { user: { id: 17, email: 'manager@suuq.test' } } as any,
    );

    expect(hospitalityWorkflowsService.splitOpenBill).toHaveBeenCalledWith(
      21,
      'check-4',
      expect.objectContaining({
        lineIds: ['line-1', 'line-2'],
        targetBillLabel: 'Patio Split',
        idempotencyKey: 'split-1',
      }),
      {
        id: 17,
        email: 'manager@suuq.test',
      },
    );
  });

  it('delegates reopen bill requests with the authenticated actor', async () => {
    hospitalityWorkflowsService.reopenSettledBill.mockResolvedValue({
      status: 'UPDATED',
    });

    await controller.reopenSettledBill(
      '21',
      'check-4',
      {
        reason: 'Manager approved reopen after settlement correction',
        confirmed: true,
        idempotencyKey: 'reopen-1',
      },
      { user: { id: 17, email: 'manager@suuq.test' } } as any,
    );

    expect(hospitalityWorkflowsService.reopenSettledBill).toHaveBeenCalledWith(
      21,
      'check-4',
      expect.objectContaining({
        confirmed: true,
        idempotencyKey: 'reopen-1',
      }),
      {
        id: 17,
        email: 'manager@suuq.test',
      },
    );
  });

  it('delegates void bill requests with the authenticated actor', async () => {
    hospitalityWorkflowsService.voidSettledBill.mockResolvedValue({
      status: 'UPDATED',
    });

    await controller.voidSettledBill(
      '21',
      'check-8',
      {
        reason: 'Duplicate payment reversal',
        confirmed: true,
        idempotencyKey: 'void-1',
      },
      { user: { id: 19, email: 'lead@suuq.test' } } as any,
    );

    expect(hospitalityWorkflowsService.voidSettledBill).toHaveBeenCalledWith(
      21,
      'check-8',
      expect.objectContaining({
        confirmed: true,
        idempotencyKey: 'void-1',
      }),
      {
        id: 19,
        email: 'lead@suuq.test',
      },
    );
  });
});
