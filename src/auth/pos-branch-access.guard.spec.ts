import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HospitalityWorkflowsController } from '../hospitality/hospitality-workflows.controller';
import { PosCheckoutController } from '../pos-sync/pos-checkout.controller';
import { PosBranchAccessGuard } from './pos-branch-access.guard';

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

describe('PosBranchAccessGuard', () => {
  const guard = new PosBranchAccessGuard(new Reflector());

  it('rejects checkout void for an operator token without VOID_SETTLED_BILL permission', () => {
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

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Your POS operator token does not include the required branch permission.',
    );
  });

  it('rejects hospitality reopen for an operator token without REOPEN_SETTLED_BILL permission', () => {
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

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Your POS operator token does not include the required branch permission.',
    );
  });
});
