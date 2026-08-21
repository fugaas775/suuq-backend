import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
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

// The roster, for the sessions that carry no permissions claim of their own.
// `rosterRows` is what branch_staff_assignments would return for the (userId,
// branchId) asked for; the default is an empty roll.
const rosterFind = jest.fn().mockResolvedValue([]);
const dataSourceStub = {
  getRepository: () => ({ find: rosterFind }),
} as unknown as DataSource;

describe('PosBranchAccessGuard', () => {
  const guard = new PosBranchAccessGuard(
    new Reflector(),
    revocationServiceStub,
    dataSourceStub,
  );

  beforeEach(() => {
    rosterFind.mockReset();
    rosterFind.mockResolvedValue([]);
  });

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

  it('honours a permission whose code arrived wrapped in array-literal punctuation', async () => {
    /* `permissions` is a simple-array — ONE text column split on commas — so a
       row written as a Postgres array literal splits into rubbish at both ends:
       `{"OPEN_REGISTER` and `VIEW_FOLIO_BOARD}`. The first and last permission a
       cashier was granted then match nothing, silently. Three SMAG School
       cashier rows are stored that way and their operator could not open a
       register session all week. The rows are being repaired, but a token lives
       8h, so the guard has to hold for the ones already in tills. */
    const context = createExecutionContext(
      PosCheckoutController.prototype.voidCheckout,
      PosCheckoutController,
      {
        query: { branchId: '9' },
        user: {
          id: 53,
          tokenType: 'pos_operator',
          branchId: 9,
          branchRole: 'OPERATOR',
          permissions: ['{"VOID_SETTLED_BILL', 'VIEW_FOLIO_BOARD}'],
          roles: ['POS_OPERATOR'],
        },
      },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('still refuses a token whose codes are damaged into something else', async () => {
    // Sanitising must not turn a near-miss into a match: stripping punctuation
    // is not the same as guessing what was meant.
    const context = createExecutionContext(
      PosCheckoutController.prototype.voidCheckout,
      PosCheckoutController,
      {
        query: { branchId: '9' },
        user: {
          id: 54,
          tokenType: 'pos_operator',
          branchId: 9,
          branchRole: 'OPERATOR',
          permissions: ['VOID SETTLED BILL', '{"OPEN_REGISTER'],
          roles: ['POS_OPERATOR'],
        },
      },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
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

  /* An ordinary account session — signed in with email and password rather than
     unlocked at the gate — carries roles and no `permissions` claim at all. That
     absence used to read as "holds none", which refused every write-side POS
     route to every operator on a plain sign-in while leaving the role-gated
     checkout route open to them. SMAG School banked ETB 1,500 of fees that its
     roll never heard about that way. */
  it('resolves the roster for a session that carries no permissions claim', async () => {
    rosterFind.mockResolvedValue([
      { id: 324, permissions: ['SUSPEND_SALE', 'VOID_SETTLED_BILL'] },
    ]);

    const context = createExecutionContext(
      PosCheckoutController.prototype.voidCheckout,
      PosCheckoutController,
      {
        query: { branchId: '9' },
        user: { id: 55, roles: ['POS_OPERATOR'] },
      },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(rosterFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 55, branchId: 9, isActive: true },
      }),
    );
  });

  it('still refuses a claimless session the roster does not grant', async () => {
    rosterFind.mockResolvedValue([{ id: 325, permissions: ['OPEN_REGISTER'] }]);

    const context = createExecutionContext(
      PosCheckoutController.prototype.voidCheckout,
      PosCheckoutController,
      {
        query: { branchId: '9' },
        user: { id: 56, roles: ['POS_OPERATOR'] },
      },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  /* An EMPTY claim is not an absent one. A POS token states what the gate
     resolved, so an operator granted nothing must stay refused — falling back to
     the roster here would hand a revoked clerk their permissions back mid-shift,
     which is the opposite of what the 8h token is for. */
  it('does not consult the roster for a POS token that states no permissions', async () => {
    rosterFind.mockResolvedValue([
      { id: 326, permissions: ['VOID_SETTLED_BILL'] },
    ]);

    const context = createExecutionContext(
      PosCheckoutController.prototype.voidCheckout,
      PosCheckoutController,
      {
        query: { branchId: '9' },
        user: {
          id: 57,
          tokenType: 'pos_operator',
          branchId: 9,
          branchRole: 'OPERATOR',
          permissions: [],
          roles: ['POS_OPERATOR'],
        },
      },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(rosterFind).not.toHaveBeenCalled();
  });

  it('refuses a claimless session when no branch can be resolved', async () => {
    const context = createExecutionContext(
      PosCheckoutController.prototype.voidCheckout,
      PosCheckoutController,
      { query: {}, user: { id: 58, roles: ['POS_OPERATOR'] } },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(rosterFind).not.toHaveBeenCalled();
  });
});
