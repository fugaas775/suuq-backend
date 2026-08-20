import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VehicleRegistryService } from './vehicle-registry.service';
import { VehiclePlateStatus } from './entities/vehicle-plate.entity';
import { VehicleRegistrationStatus } from './entities/vehicle-registration.entity';
import {
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import { RECEIPT_VERIFICATION_CODE_ALPHABET } from '../pos-sync/receipt-verification-code';

/**
 * The registry's rules, which are the ones a paper register cannot enforce:
 * one live licence per chassis across the whole region, one plate to one clerk,
 * and no certificate without a fee behind it.
 */

function repo(overrides: any = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (row: any) => row),
    create: jest.fn((row: any) => row),
    createQueryBuilder: jest.fn(() => qb()),
    ...overrides,
  };
}

function qb(result: any = null, count = 0) {
  const self: any = {
    select: () => self,
    addSelect: () => self,
    where: () => self,
    andWhere: () => self,
    orderBy: () => self,
    groupBy: () => self,
    addGroupBy: () => self,
    limit: () => self,
    getOne: jest.fn().mockResolvedValue(result),
    getCount: jest.fn().mockResolvedValue(count),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  return self;
}

function makeService({
  branch = { id: 7, retailTenantId: 42 },
  queries = [] as any[],
  managerQuery = jest.fn().mockResolvedValue([]),
  registrationFindOne = null as any,
  checkout = null as any,
  vehicleClass = null as any,
  vehicle = null as any,
  plateClash = [] as any[],
  spentCheckoutRegistration = null as any,
} = {}) {
  const saved: any[] = [];

  const manager: any = {
    query: managerQuery,
    create: (_e: any, row: any) => row,
    save: jest.fn(async (row: any) => {
      const withId = row.id ? row : { ...row, id: 555 };
      saved.push(withId);
      return withId;
    }),
    update: jest.fn(),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => qb()),
  };

  const dataSource: any = {
    transaction: jest.fn(async (fn: any) => fn(manager)),
    query: jest.fn(async (...args: any[]) => {
      queries.push(args);
      return [];
    }),
    getRepository: jest.fn(() => ({
      findOne: jest.fn().mockResolvedValue(checkout),
    })),
  };

  const classes = repo({
    findOne: jest.fn().mockResolvedValue(vehicleClass),
    createQueryBuilder: jest.fn(() => qb(null, 0)),
  });
  const plates = repo({
    createQueryBuilder: jest.fn(() => {
      const b = qb();
      b.getRawMany = jest.fn().mockResolvedValue(plateClash);
      return b;
    }),
  });
  // Where-aware, because the service asks this repository two different
  // questions — "load registration 77" and "has checkout 3001 already been
  // spent?" — and a mock that answered both with the same row would hide the
  // difference between them.
  const registrations = repo({
    findOne: jest.fn(async (opts: any) => {
      if (opts?.where?.issuedCheckoutId !== undefined) {
        return spentCheckoutRegistration;
      }
      return registrationFindOne;
    }),
  });
  const vehicles = repo({
    findOne: jest.fn().mockResolvedValue(vehicle),
  });

  const svc = new VehicleRegistryService(
    classes as any,
    repo() as any,
    vehicles as any,
    repo() as any,
    plates as any,
    registrations as any,
    repo() as any,
    { findOne: jest.fn().mockResolvedValue(branch) } as any,
    dataSource,
  );

  return { svc, manager, dataSource, saved, registrations, plates };
}

describe('VehicleRegistryService — region scope', () => {
  it('refuses to work on a branch with no tenant', async () => {
    // The whole point of the registry is that a chassis is unique across the
    // REGION. A branch with no tenant would silently degrade that to per-office
    // uniqueness, and nobody would find out until two woredas had issued the
    // same plate — so this fails loudly rather than defaulting.
    const { svc } = makeService({ branch: { id: 7, retailTenantId: null } });

    await expect(svc.listClasses({ branchId: 7 } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses an unknown branch', async () => {
    const { svc } = makeService({ branch: null });
    await expect(
      svc.listClasses({ branchId: 999 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('VehicleRegistryService — plate allocation', () => {
  it('takes the plate with SKIP LOCKED, not a read-then-write', async () => {
    // This is the entire safety argument for two clerks pressing Issue in the
    // same second. A SELECT-then-UPDATE hands both the same number, and the
    // failure is invisible until two cars carry one plate — so the statement
    // shape is asserted rather than trusted to survive a future tidy-up.
    const managerQuery = jest
      .fn()
      .mockResolvedValue([{ id: 900, plateNumber: '5-00001' }]);

    const { svc, manager } = makeService({
      managerQuery,
      vehicleClass: {
        id: 3,
        nameEn: 'Private car',
        status: 'ACTIVE',
        renewalMonths: 12,
      },
    });

    await svc.draftRegistration(
      {
        branchId: 7,
        classId: 3,
        owner: { fullName: 'Ayaan Yuusuf' },
        vehicle: { vin: 'CHASSIS123' },
      } as any,
      11,
    );

    const sql = String(managerQuery.mock.calls[0][0]);
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('SKIP LOCKED');
    // Oldest series first, then lowest number: plates leave the drawer in the
    // order the office was given them.
    expect(sql).toContain('ORDER BY s."createdAt" ASC, pick."sortKey" ASC');
    expect(sql).toContain('LIMIT 1');

    const params = managerQuery.mock.calls[0][1];
    expect(params).toContain(VehiclePlateStatus.ALLOCATED);
    expect(params).toContain(VehiclePlateStatus.IN_STOCK);

    void manager;
  });

  it('says the office is out of plates rather than issuing without one', async () => {
    const { svc } = makeService({
      managerQuery: jest.fn().mockResolvedValue([]),
      vehicleClass: {
        id: 3,
        nameEn: 'Private car',
        status: 'ACTIVE',
        renewalMonths: 12,
      },
    });

    await expect(
      svc.draftRegistration(
        {
          branchId: 7,
          classId: 3,
          owner: { fullName: 'Ayaan Yuusuf' },
          vehicle: { vin: 'CHASSIS123' },
        } as any,
        11,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('VehicleRegistryService — plate series', () => {
  it('refuses a range big enough to be a typo', async () => {
    const { svc } = makeService();
    await expect(
      svc.createPlateSeries({
        branchId: 7,
        prefix: '5',
        rangeStart: 1,
        rangeEnd: 99_999_999,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an inverted range', async () => {
    const { svc } = makeService();
    await expect(
      svc.createPlateSeries({
        branchId: 7,
        prefix: '5',
        rangeStart: 500,
        rangeEnd: 100,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses the WHOLE series when any number already exists in the region', async () => {
    // Partial creation would leave an office holding blanks the system believes
    // belong to another woreda — the exact confusion the tenant-wide unique
    // index exists to prevent, found one plate at a time instead of at once.
    const { svc } = makeService({
      plateClash: [{ plateNumber: '5-00007' }],
    });

    await expect(
      svc.createPlateSeries({
        branchId: 7,
        prefix: '5',
        rangeStart: 1,
        rangeEnd: 10,
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('VehicleRegistryService — issuance', () => {
  const pending = {
    id: 77,
    tenantId: 42,
    branchId: 7,
    vehicleId: 5,
    ownerId: 9,
    plateId: 900,
    status: VehicleRegistrationStatus.PENDING_ISSUE,
    issuedCheckoutId: null,
  };

  const goodCheckout = {
    id: 3001,
    branchId: 7,
    transactionType: PosCheckoutTransactionType.SALE,
    status: PosCheckoutStatus.PROCESSED,
    voidedAt: null,
  };

  it('issues against a settled checkout and stamps an expiry from the class', async () => {
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: goodCheckout,
      vehicle: { id: 5, classId: 3, tenantId: 42 },
      vehicleClass: { id: 3, renewalMonths: 12, nameEn: 'Private car' },
    });

    const issued: any = await svc.issueRegistration(
      77,
      { branchId: 7, checkoutId: 3001 } as any,
      11,
    );

    expect(issued.status).toBe(VehicleRegistrationStatus.ACTIVE);
    expect(issued.issuedCheckoutId).toBe(3001);
    expect(issued.certificateNumber).toBe('VR-7-00000077');
    // Twelve months on, from the class, not a hard-coded year.
    const months =
      (issued.expiresAt.getFullYear() - issued.issuedAt.getFullYear()) * 12 +
      (issued.expiresAt.getMonth() - issued.issuedAt.getMonth());
    expect(months).toBe(12);
  });

  it('mints a verification code from the shared receipt alphabet', async () => {
    // Shared deliberately: the I/L→1 and O→0 folding is what lets an officer
    // read a code down a phone line without ambiguity.
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: goodCheckout,
      vehicle: { id: 5, classId: 3, tenantId: 42 },
      vehicleClass: { id: 3, renewalMonths: 12, nameEn: 'Private car' },
    });

    const issued: any = await svc.issueRegistration(
      77,
      { branchId: 7, checkoutId: 3001 } as any,
      11,
    );

    expect(issued.verificationCode).toHaveLength(14);
    for (const ch of issued.verificationCode) {
      expect(RECEIPT_VERIFICATION_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is idempotent: asking twice returns the same certificate', async () => {
    // A register retrying over a bad connection, or a clerk pressing twice,
    // must not mint a second registration or eat a second plate.
    const already = {
      ...pending,
      status: VehicleRegistrationStatus.ACTIVE,
      issuedCheckoutId: 3001,
      certificateNumber: 'VR-7-00000077',
    };
    const { svc, dataSource } = makeService({
      registrationFindOne: already,
      checkout: goodCheckout,
    });

    const issued: any = await svc.issueRegistration(77, {
      branchId: 7,
      checkoutId: 3001,
    } as any);

    expect(issued.certificateNumber).toBe('VR-7-00000077');
    // No second transaction — nothing was re-issued.
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('refuses to spend one payment on two registrations', async () => {
    // One fee, one certificate. Without this a clerk could draft twice and
    // issue both against a single settled basket — two plates gone, one paid.
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: goodCheckout,
      vehicle: { id: 5, classId: 3, tenantId: 42 },
      vehicleClass: { id: 3, renewalMonths: 12, nameEn: 'Private car' },
      spentCheckoutRegistration: {
        id: 78,
        certificateNumber: 'VR-7-00000078',
      },
    });

    await expect(
      svc.issueRegistration(77, { branchId: 7, checkoutId: 3001 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a voided payment', async () => {
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: { ...goodCheckout, status: PosCheckoutStatus.VOIDED },
    });

    await expect(
      svc.issueRegistration(77, { branchId: 7, checkoutId: 3001 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses another office's payment", async () => {
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: { ...goodCheckout, branchId: 99 },
    });

    await expect(
      svc.issueRegistration(77, { branchId: 7, checkoutId: 3001 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a return as payment for a registration', async () => {
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: {
        ...goodCheckout,
        transactionType: PosCheckoutTransactionType.RETURN,
      },
    });

    await expect(
      svc.issueRegistration(77, { branchId: 7, checkoutId: 3001 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
