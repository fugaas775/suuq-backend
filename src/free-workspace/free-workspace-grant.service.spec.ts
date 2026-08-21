import { FreeWorkspaceGrantService } from './free-workspace-grant.service';
import {
  AccountFreeWorkspaceGrant,
  FreeWorkspaceGrantKind,
} from './entities/account-free-workspace-grant.entity';

/**
 * Stands in for the table AND its partial unique index — the index is the thing
 * actually enforcing "one free workspace per account", so a mock that lets two
 * inserts through would test nothing.
 */
function buildRepository() {
  const rows: AccountFreeWorkspaceGrant[] = [];
  let nextId = 1;

  return {
    rows,
    createQueryBuilder: () => ({
      insert: () => ({
        into: () => ({
          values: (value: any) => ({
            orIgnore: () => ({
              returning: () => ({
                execute: async () => {
                  const conflicts = rows.some(
                    (row) =>
                      row.userId === value.userId && row.releasedAt == null,
                  );
                  if (conflicts) {
                    return { raw: [] };
                  }
                  const row = {
                    id: nextId++,
                    releasedAt: null,
                    ...value,
                  } as AccountFreeWorkspaceGrant;
                  rows.push(row);
                  return { raw: [row] };
                },
              }),
            }),
          }),
        }),
      }),
    }),
    findOne: async ({ where }: any) =>
      rows.find(
        (row) => row.userId === where.userId && row.releasedAt == null,
      ) ?? null,
    save: async (row: AccountFreeWorkspaceGrant) => row,
  } as any;
}

const BRANCH = {
  kind: FreeWorkspaceGrantKind.BRANCH,
  planCode: 'POS_BRANCH_FREE_2026',
  endsAt: new Date('2026-12-31T20:59:59.999Z'),
  branchId: 21,
  retailTenantId: 31,
};

const SUPPLIER = {
  kind: FreeWorkspaceGrantKind.SUPPLIER,
  planCode: 'SUPPLIER_FREE_2026',
  endsAt: new Date('2026-12-31T20:59:59.999Z'),
  supplierProfileId: 55,
};

describe('FreeWorkspaceGrantService', () => {
  let repository: ReturnType<typeof buildRepository>;
  let service: FreeWorkspaceGrantService;

  beforeEach(() => {
    repository = buildRepository();
    service = new FreeWorkspaceGrantService(repository);
  });

  it('gives an account its first workspace free', async () => {
    expect(await service.hasClaimedFreeWorkspace(9)).toBe(false);

    const grant = await service.claim(9, BRANCH);

    expect(grant).toMatchObject({ userId: 9, branchId: 21, kind: 'BRANCH' });
    expect(await service.hasClaimedFreeWorkspace(9)).toBe(true);
  });

  it('refuses a second branch on the same account', async () => {
    await service.claim(9, BRANCH);

    expect(await service.claim(9, { ...BRANCH, branchId: 22 })).toBeNull();
    expect(repository.rows).toHaveLength(1);
  });

  it('refuses a supplier account once the branch is free, and the reverse', async () => {
    // The allowance is one WORKSPACE, not one of each: an account with a free
    // branch pays for its supplier account, and an account with a free supplier
    // account pays for its branch.
    await service.claim(9, BRANCH);
    expect(await service.claim(9, SUPPLIER)).toBeNull();

    await service.claim(10, SUPPLIER);
    expect(await service.claim(10, BRANCH)).toBeNull();
  });

  it('is idempotent for the same workspace', async () => {
    // Re-running onboarding, or a retried request, must return the grant rather
    // than reporting the workspace chargeable.
    const first = await service.claim(9, BRANCH);
    const again = await service.claim(9, BRANCH);

    expect(again).toMatchObject({ id: first.id });
    expect(repository.rows).toHaveLength(1);
  });

  it('does not hand the slot back when the workspace is deleted', async () => {
    // The whole reason this is a row on the user and not a query over
    // subscriptions: deleting the free branch cascades its subscription away,
    // and an owner could otherwise restart the free period at will.
    await service.claim(9, BRANCH);
    repository.rows[0].branchId = null;

    expect(await service.claim(9, { ...BRANCH, branchId: 40 })).toBeNull();
  });

  it('lets support hand the slot back, and only once', async () => {
    await service.claim(9, BRANCH);

    const released = await service.release(9, 'Created by mistake');
    expect(released?.releasedAt).toBeInstanceOf(Date);
    expect(released?.releasedReason).toBe('Created by mistake');

    expect(await service.hasClaimedFreeWorkspace(9)).toBe(false);
    expect(await service.claim(9, { ...BRANCH, branchId: 40 })).toMatchObject({
      branchId: 40,
    });
    // The released row stays for the audit trail.
    expect(repository.rows).toHaveLength(2);
    expect(await service.release(9, 'again')).not.toBeNull();
  });

  it('refuses to grant anything to a missing user', async () => {
    expect(await service.claim(0, BRANCH)).toBeNull();
    expect(await service.hasClaimedFreeWorkspace(NaN)).toBe(false);
  });
});
