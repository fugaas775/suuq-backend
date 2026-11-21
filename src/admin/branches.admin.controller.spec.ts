import { AuditService } from '../audit/audit.service';
import { BranchesService } from '../branches/branches.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { BranchSalesService } from '../branches/branch-sales.service';
import { BranchesAdminController } from './branches.admin.controller';

/**
 * The extend route is an admin-recorded renewal: the service writes the term,
 * the controller pins the actor and reason to the audit log. The log is what
 * answers "who granted this branch six months, and why" later.
 */
describe('BranchesAdminController.extendSubscription', () => {
  it('extends through the service and audits the actor, reason and new term', async () => {
    const result = {
      branch: { id: 47, name: 'Muntaha Hotel', retailTenantId: 19 },
      previous: {
        id: 90,
        planCode: 'POS_BRANCH_6M',
        endsAt: new Date('2026-11-01T14:34:01Z'),
      },
      subscription: {
        id: 91,
        planCode: 'POS_BRANCH_6M',
        currency: 'ETB',
        startsAt: new Date('2026-11-01T14:34:01Z'),
        endsAt: new Date('2027-05-01T14:34:01Z'),
      },
      billingState: 'PAYING',
      chainsFromPreviousEnd: true,
      amountTotal: 11400,
      monthlyRate: 1900,
    };
    const branchesService = {
      extendAdminBranchSubscription: jest.fn().mockResolvedValue(result),
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new BranchesAdminController(
      branchesService as unknown as BranchesService,
      auditService as unknown as AuditService,
      {} as unknown as BranchSalesService,
    );
    const req = {
      user: { id: 1, email: 'admin@suuq.test' },
    } as unknown as AuthenticatedRequest;

    const dto = { months: 6, reason: 'Paid 11,400 ETB by bank transfer' };
    await expect(controller.extendSubscription(47, dto, req)).resolves.toBe(
      result,
    );

    expect(branchesService.extendAdminBranchSubscription).toHaveBeenCalledWith(
      47,
      dto,
      { id: 1, email: 'admin@suuq.test' },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'branch.subscription.extend',
        targetType: 'branch',
        targetId: 47,
        actorId: 1,
        actorEmail: 'admin@suuq.test',
        reason: 'Paid 11,400 ETB by bank transfer',
        meta: expect.objectContaining({
          branchName: 'Muntaha Hotel',
          months: 6,
          planCode: 'POS_BRANCH_6M',
          subscriptionId: 91,
          amountTotal: 11400,
          previousSubscriptionId: 90,
          chainsFromPreviousEnd: true,
        }),
      }),
    );
  });

  it('writes no audit entry when the service refuses', async () => {
    const branchesService = {
      extendAdminBranchSubscription: jest
        .fn()
        .mockRejectedValue(new Error('Branch #999 not found')),
    };
    const auditService = { log: jest.fn() };
    const controller = new BranchesAdminController(
      branchesService as unknown as BranchesService,
      auditService as unknown as AuditService,
      {} as unknown as BranchSalesService,
    );
    const req = { user: { id: 1 } } as unknown as AuthenticatedRequest;

    await expect(
      controller.extendSubscription(999, { months: 6, reason: 'x' }, req),
    ).rejects.toThrow('Branch #999 not found');
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
