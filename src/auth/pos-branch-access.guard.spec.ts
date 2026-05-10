import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HospitalityWorkflowsController } from '../hospitality/hospitality-workflows.controller';
import { PosCheckoutController } from '../pos-sync/pos-checkout.controller';
import { PosBranchAccessGuard } from './pos-branch-access.guard';
import { PosSessionRevocationService } from './pos-session-revocation.service';

type TestHandler = (...args: never[]) => unknown;
type TestControllerClass = abstract new (...args: never[]) => object;

function createExecutionContext(
  handler: TestHandler,
  controllerClass: TestControllerClass,
  request: Record<string, unknown>,
) {
  return {
    getHandler: () => handler,
    getClass: () => controllerClass,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any;
}

// Stub revocation service: always reports tokens as valid (no revocation on record)
const revocationServiceStub = {
  isOperatorTokenValid: jest.fn().mockResolvedValue(true),
  revokeAllOperatorSessions: jest.fn().mockResolvedValue(undefined),
} as unknown as PosSessionRevocationService;

describe('PosBranchAccessGuard', () => {
  const guard = new PosBranchAccessGuard(
    new Reflector(),
    revocationServiceStub,
  );

  it('rejects checkout void for an operator token without VOID_SETTLED_BILL permission', async () => {
    const context = createExecutionContext(
      PosCheckoutController.prototype.voidCheckout,
      PosCheckoutController,
      {
        query: { branchId: '9' },
        user: {
          id: 51,
          tokenType: 'pos_operator',
          branchId: 9,
          branchRole: 'OPERATOR',
          permissions: ['OPEN_REGISTER'],
          roles: ['POS_OPERATOR'],
        },
      },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Your POS operator token does not include the required branch permission.',
    );
  });

  it('rejects hospitality reopen for an operator token without REOPEN_SETTLED_BILL permission', async () => {
    const context = createExecutionContext(
      HospitalityWorkflowsController.prototype.reopenSettledBill,
      HospitalityWorkflowsController,
      {
        params: { branchId: '9', billId: 'CHECK-19' },
        user: {
          id: 52,
          tokenType: 'pos_operator',
          branchId: 9,
          branchRole: 'OPERATOR',
          permissions: ['OPEN_REGISTER'],
          roles: ['POS_OPERATOR'],
        },
      },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Your POS operator token does not include the required branch permission.',
    );
  });
});
