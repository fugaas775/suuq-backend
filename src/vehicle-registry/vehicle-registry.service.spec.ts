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

describe('VehicleRegistryService — regularising an unregistered fleet', () => {
  // Every vehicle in this drive is a first registration, and most arrive
  // already wearing a number that is not ours: invented, or issued by a zonal
  // office with no regional record behind it.

  function regService({ duplicates = [] as any[], officialPlate = null as any } = {}) {
    const saved: any[] = [];
    const manager: any = {
      query: jest.fn().mockResolvedValue([{ id: 900, plateNumber: '2-SM-00001' }]),
      create: (_e: any, row: any) => row,
      save: jest.fn(async (row: any) => {
        const withId = row.id ? row : { ...row, id: 555 };
        saved.push(withId);
        return withId;
      }),
      update: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      // The manager builds queries for two different jobs here — looking a
      // chassis up (getOne) and quarantining a plate (execute) — so one stub
      // has to answer both.
      createQueryBuilder: jest.fn(() => {
        const b: any = {
          update: () => b, set: () => b, where: () => b, andWhere: () => b,
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
          getOne: jest.fn().mockResolvedValue(null),
        };
        return b;
      }),
    };
    const dataSource: any = {
      transaction: jest.fn(async (fn: any) => fn(manager)),
      query: jest.fn().mockResolvedValue(duplicates),
      getRepository: jest.fn(() => ({ findOne: jest.fn() })),
    };
    const plates = repo({
      createQueryBuilder: jest.fn(() => {
        const b = qb(officialPlate);
        b.getRawMany = jest.fn().mockResolvedValue([]);
        return b;
      }),
    });
    const svc = new VehicleRegistryService(
      { ...repo(), findOne: jest.fn().mockResolvedValue({ id: 3, nameEn: 'Private car', status: 'ACTIVE', renewalMonths: 12, plateCode: '2' }) } as any,
      repo() as any, repo() as any, repo() as any, plates as any,
      repo() as any, repo() as any, repo() as any,
      { findOne: jest.fn().mockResolvedValue({ id: 7, retailTenantId: 42 }) } as any,
      dataSource,
    );
    return { svc, saved, manager };
  }

  const draft = (vehicle: any) => ({
    branchId: 7, classId: 3,
    owner: { fullName: 'Ayaan Yuusuf' },
    vehicle: { vin: 'CHASSIS123', ...vehicle },
  });

  it('records the number the vehicle turned up wearing, and where it came from', async () => {
    const { svc, saved } = regService();
    await svc.draftRegistration(draft({
      presentedPlateNumber: '3-SM-00042',
      presentedPlateOrigin: 'UNOFFICIAL',
      presentedPlateNote: 'Owner says bought with the car',
      chassisCondition: 'WORN',
    }) as any, 11);

    const vehicle = saved.find((r) => r.vin === 'CHASSIS123');
    expect(vehicle.presentedPlateNumber).toBe('3-SM-00042');
    expect(vehicle.presentedPlateOrigin).toBe('UNOFFICIAL');
    expect(vehicle.chassisCondition).toBe('WORN');
  });

  it('registers a vehicle that arrived with no number at all', async () => {
    const { svc, saved } = regService();
    await svc.draftRegistration(draft({ presentedPlateOrigin: 'NONE' }) as any, 11);
    const vehicle = saved.find((r) => r.vin === 'CHASSIS123');
    expect(vehicle.presentedPlateNumber).toBeNull();
    expect(vehicle.presentedPlateOrigin).toBe('NONE');
  });

  it('surfaces another vehicle wearing the same invented number — without blocking', async () => {
    // Both cars are real and both need registering. Refusing would send one
    // away still wearing the fake plate, which helps nobody.
    const { svc } = regService({
      duplicates: [{ vehicleId: 99, vin: 'OTHERCHASSIS' }],
    });
    const result: any = await svc.draftRegistration(
      draft({ presentedPlateNumber: '3-SM-00042', presentedPlateOrigin: 'UNOFFICIAL' }) as any,
      11,
    );
    expect(result.presentedPlate.duplicatePresentations).toHaveLength(1);
    expect(result.presentedPlate.duplicatePresentations[0].vin).toBe('OTHERCHASSIS');
    expect(result.registration).toBeTruthy(); // still registered
  });

  it('quarantines a real blank whose number is already on a car', async () => {
    // The invented number happens to match stock in the drawer. Issuing that
    // blank to a different vehicle would put two cars on the road under one
    // number — the fault this registry exists to end, made by the registry.
    const { svc, manager } = regService({
      officialPlate: { id: 5, status: 'IN_STOCK', plateNumber: '2-SM-00001' },
    });
    const result: any = await svc.draftRegistration(
      draft({ presentedPlateNumber: '2-SM-00001', presentedPlateOrigin: 'UNOFFICIAL' }) as any,
      11,
    );

    expect(result.presentedPlate.collidesWithOfficialStock).toBe(true);
    // A quarantine UPDATE was issued against the plates table.
    expect(manager.createQueryBuilder).toHaveBeenCalled();
  });

  it('says nothing about a vehicle that presented no number', async () => {
    const { svc } = regService();
    const result: any = await svc.draftRegistration(draft({}) as any, 11);
    expect(result.presentedPlate.duplicatePresentations).toEqual([]);
    expect(result.presentedPlate.collidesWithOfficialStock).toBe(false);
  });
});

describe('VehicleRegistryService — flags', () => {
  function flagService({ vehicle = { id: 5, tenantId: 42 }, openFlag = null as any } = {}) {
    const saved: any[] = [];
    const manager: any = {
      create: (_e: any, row: any) => row,
      save: jest.fn(async (row: any) => { saved.push(row); return { ...row, id: row.id ?? 900 }; }),
      query: jest.fn(),
    };
    const dataSource: any = { transaction: jest.fn(async (fn: any) => fn(manager)) };
    const flags = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(openFlag),
      save: jest.fn(async (r: any) => r),
      create: jest.fn((r: any) => r),
      createQueryBuilder: jest.fn(() => qb()),
    };
    const svc = new VehicleRegistryService(
      repo() as any, repo() as any,
      { ...repo(), findOne: jest.fn().mockResolvedValue(vehicle) } as any,
      repo() as any, repo() as any, repo() as any, repo() as any,
      flags as any,
      { findOne: jest.fn().mockResolvedValue({ id: 7, retailTenantId: 42 }) } as any,
      dataSource,
    );
    return { svc, saved, flags };
  }

  it('records who reported it, from where, and when', async () => {
    const { svc, saved } = flagService();
    await svc.raiseFlag(
      { branchId: 7, vehicleId: 5, type: 'STOLEN' as any, reference: 'CASE-77' },
      11,
    );
    const flag = saved.find((r) => r.type === 'STOLEN');
    expect(flag.raisedByUserId).toBe(11);
    expect(flag.raisedAtBranchId).toBe(7);
    expect(flag.reference).toBe('CASE-77');
    // And an event, so the vehicle's history shows it.
    expect(saved.some((r) => r.type === 'FLAGGED')).toBe(true);
  });

  it('does not stack a second report of the same kind', async () => {
    // A second STOLEN report on an already stolen vehicle adds nothing a
    // checkpoint can act on, and buries the first.
    const existing = { id: 1, type: 'STOLEN', clearedAt: null };
    const { svc, saved } = flagService({ openFlag: existing });
    const result: any = await svc.raiseFlag(
      { branchId: 7, vehicleId: 5, type: 'STOLEN' as any },
      11,
    );
    expect(result).toBe(existing);
    expect(saved).toEqual([]);
  });

  it('refuses to release a vehicle without a reason', async () => {
    // A cleared flag is how a stolen car becomes sellable.
    const { svc } = flagService({ openFlag: { id: 1, type: 'STOLEN', clearedAt: null } });
    await expect(
      svc.clearFlag({ branchId: 7, flagId: 1, reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records who released it and why', async () => {
    const flag: any = { id: 1, vehicleId: 5, type: 'STOLEN', clearedAt: null };
    const { svc, saved } = flagService({ openFlag: flag });
    await svc.clearFlag({ branchId: 7, flagId: 1, reason: 'Recovered by police' }, 22);
    expect(flag.clearedByUserId).toBe(22);
    expect(flag.clearReason).toBe('Recovered by police');
    expect(flag.clearedAt).toBeInstanceOf(Date);
    expect(saved.some((r) => r.type === 'FLAG_CLEARED')).toBe(true);
  });

  it('refuses an unknown vehicle', async () => {
    const { svc } = flagService({ vehicle: null as any });
    await expect(
      svc.raiseFlag({ branchId: 7, vehicleId: 999, type: 'STOLEN' as any }),
    ).rejects.toBeInstanceOf(NotFoundException);
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

  it("refuses a payment that is real but is somebody else's sale", async () => {
    // Every other check passes: the payment exists, it is this office's, it is
    // a SALE, it is not voided and it is unspent. It is simply not THIS
    // registration's fee — a clerk transposed two digits and landed on another
    // customer's settled basket. Without this the registry would issue a plate
    // against a payment nobody made for it.
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: {
        ...goodCheckout,
        receiptNumber: 'R-0099',
        items: [{ sku: 'CAFE-LATTE', title: 'Latte', lineTotal: 80 }],
      },
      vehicle: { id: 5, classId: 3, tenantId: 42 },
      vehicleClass: {
        id: 3, renewalMonths: 12, nameEn: 'Private car',
        registrationFeeSku: 'VR-PRIVATE_CAR-REG',
        plateFeeSku: 'VR-PRIVATE_CAR-PLATE',
      },
    });

    await expect(
      svc.issueRegistration(77, { branchId: 7, checkoutId: 3001 } as any),
    ).rejects.toThrow(/different sale/i);
  });

  it('accepts a payment that carries the class fee', async () => {
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: {
        ...goodCheckout,
        items: [
          { sku: 'VR-PRIVATE_CAR-REG', title: 'Registration', lineTotal: 1500 },
          { sku: 'VR-PRIVATE_CAR-PLATE', title: 'Plate', lineTotal: 700 },
        ],
      },
      vehicle: { id: 5, classId: 3, tenantId: 42 },
      vehicleClass: {
        id: 3, renewalMonths: 12, nameEn: 'Private car',
        registrationFeeSku: 'VR-PRIVATE_CAR-REG',
        plateFeeSku: 'VR-PRIVATE_CAR-PLATE',
      },
    });

    const issued: any = await svc.issueRegistration(
      77, { branchId: 7, checkoutId: 3001 } as any, 11,
    );
    expect(issued.status).toBe(VehicleRegistrationStatus.ACTIVE);
  });

  it('does not block a bureau that has not finished pricing its classes', async () => {
    // A class with no fee SKUs cannot be checked against, and refusing would
    // stop registration for a configuration gap the draft already warns about.
    const { svc } = makeService({
      registrationFindOne: { ...pending },
      checkout: { ...goodCheckout, items: [{ sku: 'ANYTHING' }] },
      vehicle: { id: 5, classId: 3, tenantId: 42 },
      vehicleClass: { id: 3, renewalMonths: 12, nameEn: 'Private car' },
    });

    const issued: any = await svc.issueRegistration(
      77, { branchId: 7, checkoutId: 3001 } as any, 11,
    );
    expect(issued.status).toBe(VehicleRegistrationStatus.ACTIVE);
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
