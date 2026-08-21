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
import { generateKeyPairSync } from 'crypto';
import {
  resolvePublicKeyPem,
  verifyCertificateBlob,
} from './certificate-signing';

/**
 * The registry's rules, which are the ones a paper register cannot enforce:
 * one live licence per chassis across the whole region, one plate to one clerk,
 * and no certificate without a fee behind it.
 */

/**
 * What TypeORM's Postgres driver ACTUALLY answers an `UPDATE ... RETURNING`
 * with: `[rows, affectedCount]`, not the bare row array a SELECT gives.
 *
 * Every allocation mock in this file used to return the SELECT shape, and the
 * specs passed while `allocatePlate` was broken against a real database in two
 * ways at once — it handed back an ARRAY of plates where a plate was expected
 * (so `Number(plate.id)` was NaN), and its empty-shelf branch never fired,
 * because `[[], 0]` yields `[]`, which is truthy.
 *
 * Neither could be seen from here. A fixture I write agrees with me by
 * construction; this one is written to agree with the driver instead. Verified
 * against production Postgres — see scripts/verify-assign-plate-number.ts.
 */
function updateReturning(rows: any[]) {
  return [rows, rows.length];
}

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
  managerQuery = jest.fn().mockResolvedValue(updateReturning([])),
  registrationFindOne = null as any,
  checkout = null as any,
  vehicleClass = null as any,
  vehicle = null as any,
  plateClash = [] as any[],
  spentCheckoutRegistration = null as any,
  plateSeries = [] as any[],
  plateCounts = null as any,
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
      // Two different questions reach this builder — "what stock is left" and
      // "does any real blank already carry this invented number". The stock
      // answer is opted into explicitly so the two cannot stand in for each
      // other and quietly make a test pass for the wrong reason.
      b.getRawMany = plateCounts ?? jest.fn().mockResolvedValue(plateClash);
      return b;
    }),
  });
  const seriesRepo = repo({
    find: jest.fn().mockResolvedValue(plateSeries),
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
    classes,
    repo(),
    vehicles,
    seriesRepo,
    plates,
    registrations,
    repo(),
    repo(),
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

    await expect(
      svc.listClasses({ branchId: 7 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
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
      .mockResolvedValue(
        updateReturning([{ id: 900, plateNumber: '5-00001' }]),
      );

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
      },
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

  it('registers the vehicle even when the office holds no plates at all', async () => {
    // THE central correction. A real plate number is obtained by the Bureau
    // applying to the Federal Trade Ministry — it is not on a shelf at the
    // counter. Refusing to register without one blocked the entire drive over a
    // number nobody was going to hand over that day.
    const { svc } = makeService({
      managerQuery: jest.fn().mockResolvedValue(updateReturning([])),
      vehicleClass: {
        id: 3,
        nameEn: 'Private car',
        status: 'ACTIVE',
        renewalMonths: 12,
      },
    });

    const result: any = await svc.draftRegistration(
      {
        branchId: 7,
        classId: 3,
        owner: { fullName: 'Ayaan Yuusuf' },
        vehicle: { vin: 'CHASSIS123', presentedPlateNumber: '3-SM-00042' },
      },
      11,
    );

    expect(result.registration).toBeTruthy();
    // No plate, and that is the normal state rather than a half-finished one.
    expect(result.plate).toBeNull();
    expect(result.registration.plateId).toBeFalsy();
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

  function regService({
    duplicates = [] as any[],
    officialPlate = null as any,
  } = {}) {
    const saved: any[] = [];
    const manager: any = {
      query: jest
        .fn()
        .mockResolvedValue([{ id: 900, plateNumber: '2-SM-00001' }]),
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
          update: () => b,
          set: () => b,
          where: () => b,
          andWhere: () => b,
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
      {
        ...repo(),
        findOne: jest.fn().mockResolvedValue({
          id: 3,
          nameEn: 'Private car',
          status: 'ACTIVE',
          renewalMonths: 12,
          plateCode: '2',
        }),
      },
      repo(),
      repo(),
      repo(),
      plates,
      repo(),
      repo(),
      repo(),
      {
        findOne: jest.fn().mockResolvedValue({ id: 7, retailTenantId: 42 }),
      } as any,
      dataSource,
    );
    return { svc, saved, manager };
  }

  const draft = (vehicle: any) => ({
    branchId: 7,
    classId: 3,
    owner: { fullName: 'Ayaan Yuusuf' },
    vehicle: { vin: 'CHASSIS123', ...vehicle },
  });

  it('records the number the vehicle turned up wearing, and where it came from', async () => {
    const { svc, saved } = regService();
    await svc.draftRegistration(
      draft({
        presentedPlateNumber: '3-SM-00042',
        presentedPlateOrigin: 'UNOFFICIAL',
        presentedPlateNote: 'Owner says bought with the car',
        chassisCondition: 'WORN',
      }),
      11,
    );

    const vehicle = saved.find((r) => r.vin === 'CHASSIS123');
    expect(vehicle.presentedPlateNumber).toBe('3-SM-00042');
    expect(vehicle.presentedPlateOrigin).toBe('UNOFFICIAL');
    expect(vehicle.chassisCondition).toBe('WORN');
  });

  it('registers a vehicle that arrived with no number at all', async () => {
    const { svc, saved } = regService();
    await svc.draftRegistration(draft({ presentedPlateOrigin: 'NONE' }), 11);
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
      draft({
        presentedPlateNumber: '3-SM-00042',
        presentedPlateOrigin: 'UNOFFICIAL',
      }),
      11,
    );
    expect(result.presentedPlate.duplicatePresentations).toHaveLength(1);
    expect(result.presentedPlate.duplicatePresentations[0].vin).toBe(
      'OTHERCHASSIS',
    );
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
      draft({
        presentedPlateNumber: '2-SM-00001',
        presentedPlateOrigin: 'UNOFFICIAL',
      }),
      11,
    );

    expect(result.presentedPlate.collidesWithOfficialStock).toBe(true);
    // A quarantine UPDATE was issued against the plates table.
    expect(manager.createQueryBuilder).toHaveBeenCalled();
  });

  it('says nothing about a vehicle that presented no number', async () => {
    const { svc } = regService();
    const result: any = await svc.draftRegistration(draft({}), 11);
    expect(result.presentedPlate.duplicatePresentations).toEqual([]);
    expect(result.presentedPlate.collidesWithOfficialStock).toBe(false);
  });
});

describe('VehicleRegistryService — flags', () => {
  function flagService({
    vehicle = { id: 5, tenantId: 42 },
    openFlag = null as any,
  } = {}) {
    const saved: any[] = [];
    const manager: any = {
      create: (_e: any, row: any) => row,
      save: jest.fn(async (row: any) => {
        saved.push(row);
        return { ...row, id: row.id ?? 900 };
      }),
      query: jest.fn(),
    };
    const dataSource: any = {
      transaction: jest.fn(async (fn: any) => fn(manager)),
    };
    const flags = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(openFlag),
      save: jest.fn(async (r: any) => r),
      create: jest.fn((r: any) => r),
      createQueryBuilder: jest.fn(() => qb()),
    };
    const svc = new VehicleRegistryService(
      repo(),
      repo(),
      { ...repo(), findOne: jest.fn().mockResolvedValue(vehicle) },
      repo(),
      repo(),
      repo(),
      repo(),
      flags as any,
      {
        findOne: jest.fn().mockResolvedValue({ id: 7, retailTenantId: 42 }),
      } as any,
      dataSource,
    );
    return { svc, saved, flags };
  }

  it('records who reported it, from where, and when', async () => {
    const { svc, saved } = flagService();
    await svc.raiseFlag(
      {
        branchId: 7,
        vehicleId: 5,
        type: 'STOLEN' as any,
        reference: 'CASE-77',
      },
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
    const { svc } = flagService({
      openFlag: { id: 1, type: 'STOLEN', clearedAt: null },
    });
    await expect(
      svc.clearFlag({ branchId: 7, flagId: 1, reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records who released it and why', async () => {
    const flag: any = { id: 1, vehicleId: 5, type: 'STOLEN', clearedAt: null };
    const { svc, saved } = flagService({ openFlag: flag });
    await svc.clearFlag(
      { branchId: 7, flagId: 1, reason: 'Recovered by police' },
      22,
    );
    expect(flag.clearedByUserId).toBe(22);
    expect(flag.clearReason).toBe('Recovered by police');
    expect(flag.clearedAt).toBeInstanceOf(Date);
    expect(saved.some((r) => r.type === 'FLAG_CLEARED')).toBe(true);
  });

  it('refuses an unknown vehicle', async () => {
    const { svc } = flagService({ vehicle: null });
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
      { branchId: 7, checkoutId: 3001 },
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
      { branchId: 7, checkoutId: 3001 },
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
    });

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
        id: 3,
        renewalMonths: 12,
        nameEn: 'Private car',
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
        id: 3,
        renewalMonths: 12,
        nameEn: 'Private car',
        registrationFeeSku: 'VR-PRIVATE_CAR-REG',
        plateFeeSku: 'VR-PRIVATE_CAR-PLATE',
      },
    });

    const issued: any = await svc.issueRegistration(
      77,
      { branchId: 7, checkoutId: 3001 },
      11,
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
      77,
      { branchId: 7, checkoutId: 3001 },
      11,
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

/**
 * The way OFF the waiting list.
 *
 * Every other path sets `plateId` when the registration is drafted and never
 * again, so before `assignPlateNumber` existed a vehicle registered without a
 * number could not acquire one — the Bureau could be granted a block by the
 * Federal Trade Ministry, load it as a series, and the vehicles that had been
 * waiting for precisely that would go on waiting for ever.
 */
describe('VehicleRegistryService — the Ministry grants a number', () => {
  const ACTIVE_NO_PLATE = {
    id: 77,
    tenantId: 42,
    branchId: 7,
    vehicleId: 88,
    status: VehicleRegistrationStatus.ACTIVE,
    plateId: null,
    issuedAt: new Date('2026-03-01T00:00:00Z'),
    expiresAt: new Date('2027-03-01T00:00:00Z'),
    federalPlateRequestedAt: new Date('2026-03-02T00:00:00Z'),
    federalPlateRequestReference: 'FTM/2026/114',
    offlineSignature: 'signature-from-when-it-had-no-number',
  };

  const CLASS = {
    id: 3,
    tenantId: 42,
    renewalMonths: 12,
    interimPermitDays: 30,
    plateCode: '2',
  };
  const VEHICLE = { id: 88, tenantId: 42, classId: 3, vin: 'CHASSIS9' };

  function withStock(plate: any) {
    return makeService({
      registrationFindOne: { ...ACTIVE_NO_PLATE },
      vehicle: VEHICLE,
      vehicleClass: CLASS,
      managerQuery: jest
        .fn()
        .mockResolvedValue(updateReturning(plate ? [plate] : [])),
    });
  }

  const PLATE = {
    id: 5150,
    plateNumber: '2-SM-00042',
    plateCode: '2',
    regionCode: 'SM',
    serial: 42,
  };

  it('takes the number off the shelf with the same SKIP LOCKED statement', async () => {
    // Two registrars working the backlog on two machines must not hand one
    // number to two vehicles — the exact fault this registry exists to end.
    const { svc, manager } = withStock(PLATE);

    await svc.assignPlateNumber(77, 7, null, 1863);

    const sql = String(manager.query.mock.calls[0][0]);
    expect(sql).toMatch(/FOR UPDATE OF pick SKIP LOCKED/);
    expect(sql).toMatch(/UPDATE "pos_vehicle_plates"/);
  });

  it('attaches the plate and marks it ISSUED, not FITTED', async () => {
    const { svc, manager } = withStock(PLATE);

    const result = await svc.assignPlateNumber(77, 7, null, 1863);

    expect(Number(result.plateId)).toBe(5150);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 5150 },
      { status: VehiclePlateStatus.ISSUED },
    );
  });

  it('re-signs the certificate, because the signature names the plate', async () => {
    // The offline payload carries the plate code, region and serial. A
    // signature minted when the vehicle had no number attests to no number, so
    // keeping it would print a certificate whose QR — verified offline —
    // contradicts the plate on its own face.
    //
    // A real key is configured for this test on purpose. Without one
    // `signCertificate` returns null, which differs from the stale value and
    // would pass while proving nothing — the test would go green whether the
    // signature was recomputed or simply thrown away.
    const { privateKey } = generateKeyPairSync('ed25519');
    const previous = process.env.VEHICLE_REGISTRY_SIGNING_KEY;
    process.env.VEHICLE_REGISTRY_SIGNING_KEY = privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();

    try {
      const { svc } = withStock(PLATE);
      const result = await svc.assignPlateNumber(77, 7, null, 1863);

      expect(result.offlineSignature).toBeTruthy();
      expect(result.offlineSignature).not.toBe(
        'signature-from-when-it-had-no-number',
      );

      // And it verifies as a real certificate for the number just granted.
      const verdict = verifyCertificateBlob(
        result.offlineSignature,
        resolvePublicKeyPem(process.env),
      );
      expect(verdict.valid).toBe(true);
      expect(verdict.payload?.serial).toBe(42);
      expect(verdict.payload?.plateCode).toBe('2');
    } finally {
      if (previous === undefined) {
        delete process.env.VEHICLE_REGISTRY_SIGNING_KEY;
      } else {
        process.env.VEHICLE_REGISTRY_SIGNING_KEY = previous;
      }
    }
  });

  it('starts the fitting clock NOW, not back at registration', async () => {
    // The permit covers the gap between having a number and wearing it, and
    // that gap opens today. Backdating it to an issuance five months ago hands
    // someone a permit that has already run out.
    const { svc } = withStock(PLATE);

    const result = await svc.assignPlateNumber(77, 7, null, 1863);

    const expiry = new Date(result.interimPermitExpiresAt).getTime();
    expect(expiry).toBeGreaterThan(Date.now());
    expect(result.interimPermitNumber).toBe('IP-7-00000077');
  });

  it('records the issue against the federal request that produced it', async () => {
    const { svc, saved } = withStock(PLATE);

    await svc.assignPlateNumber(77, 7, null, 1863);

    const event = saved.find((row: any) => row.type === 'PLATE_ISSUED');
    expect(event).toBeTruthy();
    expect(event.meta.plateNumber).toBe('2-SM-00042');
    expect(event.meta.afterFederalRequest).toBe(true);
    expect(event.reason).toBe('FTM/2026/114');
  });

  it('refuses when the office has no number to give', async () => {
    // Here, unlike at the counter, an empty shelf IS the error. Registering
    // without a number must never be blocked; being ASKED for a number the
    // office does not hold is a registrar on the wrong row.
    const { svc } = withStock(null);

    await expect(
      svc.assignPlateNumber(77, 7, null, 1863),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('is idempotent — a registrar clearing a half-worked list is not an error', async () => {
    const { svc, manager } = makeService({
      registrationFindOne: { ...ACTIVE_NO_PLATE, plateId: 5150 },
      vehicle: VEHICLE,
      vehicleClass: CLASS,
    });

    const result = await svc.assignPlateNumber(77, 7, null, 1863);

    expect(Number(result.plateId)).toBe(5150);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('refuses to number a registration that is not live', async () => {
    const { svc } = makeService({
      registrationFindOne: {
        ...ACTIVE_NO_PLATE,
        status: VehicleRegistrationStatus.DEREGISTERED,
      },
      vehicle: VEHICLE,
      vehicleClass: CLASS,
    });

    await expect(
      svc.assignPlateNumber(77, 7, null, 1863),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('VehicleRegistryService — fitting a plate that exists', () => {
  it('refuses to record a fitment for a vehicle that has no number', async () => {
    // Recording one would write a fitment that cannot have happened AND — since
    // the fitting worklist keys off `plateFittedAt` — quietly drop the vehicle
    // off the only list that was going to chase it.
    const { svc } = makeService({
      registrationFindOne: {
        id: 77,
        tenantId: 42,
        vehicleId: 88,
        status: VehicleRegistrationStatus.ACTIVE,
        plateId: null,
        plateFittedAt: null,
      },
    });

    await expect(svc.confirmPlateFitted(77, 7, 1863)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('still records a fitment when there is a plate', async () => {
    const { svc } = makeService({
      registrationFindOne: {
        id: 77,
        tenantId: 42,
        vehicleId: 88,
        status: VehicleRegistrationStatus.ACTIVE,
        plateId: 5150,
        plateFittedAt: null,
      },
    });

    const result = await svc.confirmPlateFitted(77, 7, 1863);
    expect(result.plateFittedAt).toBeInstanceOf(Date);
  });
});

describe('VehicleRegistryService — the two worklists are two lists', () => {
  it('never puts a vehicle with no number on the fitting list', async () => {
    // Without this the fitting list is every plateless registration, which —
    // since a number comes from a federal application rather than a shelf — is
    // very nearly the whole register. "Awaiting number" would be a SUBSET of
    // "awaiting fitting" rather than the separate backlog it is, and the
    // dashboard card would show the office its entire fleet as a plate backlog.
    const queries: any[] = [];
    const { svc } = makeService({ queries });

    await svc.listAwaitingPlateFitment(7);

    const sql = String(queries[0][0]);
    expect(sql).toMatch(/r\."plateId" IS NOT NULL/);
    expect(sql).toMatch(/r\."plateFittedAt" IS NULL/);
  });

  it('lists only vehicles with no number as awaiting a number', async () => {
    const queries: any[] = [];
    const { svc } = makeService({ queries });

    await svc.listAwaitingPlateNumber(7);

    expect(String(queries[0][0])).toMatch(/r\."plateId" IS NULL/);
  });
});

/**
 * A plate's code says what the vehicle is FOR — 1 taxi, 2 private, 3
 * commercial, 4 government, 5 religious and civic — and it is how an officer
 * reads a category at thirty metres.
 */
describe('VehicleRegistryService — a truck must not be handed a taxi plate', () => {
  const CLASS_TRUCK = {
    id: 11,
    tenantId: 42,
    nameEn: 'Goods truck',
    plateCode: '3',
    renewalMonths: 12,
    interimPermitDays: 30,
  };

  it('asks only for plates carrying the class’s own code', async () => {
    // A series is a block of ONE code, but `plate_series.classId` is a single
    // nullable column and a code serves several classes — 3 covers the truck,
    // the bus and the trailer — so an office cannot express "this block is
    // commercial" through it. In production all five blocks were left NULL,
    // every series matched every class, and ordering by series age meant the
    // FIRST block won every time: a goods truck was allocated 1-SM-00001.
    const managerQuery = jest
      .fn()
      .mockResolvedValue(
        updateReturning([{ id: 900, plateNumber: '3-SM-00001' }]),
      );

    const { svc } = makeService({
      managerQuery,
      registrationFindOne: {
        id: 77,
        tenantId: 42,
        vehicleId: 88,
        status: VehicleRegistrationStatus.ACTIVE,
        plateId: null,
      },
      vehicle: { id: 88, tenantId: 42, classId: 11, vin: 'CHASSIS9' },
      vehicleClass: CLASS_TRUCK,
    });

    await svc.assignPlateNumber(77, 7, null, 1863);

    const sql = String(managerQuery.mock.calls[0][0]);
    expect(sql).toContain('pick."plateCode" = $9::text');
    expect(managerQuery.mock.calls[0][1]).toContain('3');
  });

  it('names the code and the class when there is none of it left', async () => {
    // "No plate available" sends a registrar to look at a drawer with 400
    // blanks in it. Naming the code tells them WHICH block is empty.
    const { svc } = makeService({
      managerQuery: jest.fn().mockResolvedValue(updateReturning([])),
      registrationFindOne: {
        id: 77,
        tenantId: 42,
        vehicleId: 88,
        status: VehicleRegistrationStatus.ACTIVE,
        plateId: null,
      },
      vehicle: { id: 88, tenantId: 42, classId: 11, vin: 'CHASSIS9' },
      vehicleClass: CLASS_TRUCK,
    });

    await expect(svc.assignPlateNumber(77, 7, null, 1863)).rejects.toThrow(
      // `[\s\S]` rather than the /s flag: this project's tsconfig targets
      // below es2018, where dotAll is a compile error.
      /code 3[\s\S]*Goods truck/,
    );
  });

  it('still registers at the counter when that code is out of stock', async () => {
    // The counter must NOT be blocked by an empty block — that is the rule the
    // whole drive depends on. Narrowing the search must not quietly reintroduce
    // the failure that stopped every registration.
    const { svc } = makeService({
      managerQuery: jest.fn().mockResolvedValue(updateReturning([])),
      vehicleClass: {
        id: 11,
        nameEn: 'Goods truck',
        plateCode: '3',
        status: 'ACTIVE',
        renewalMonths: 12,
      },
    });

    const result: any = await svc.draftRegistration(
      {
        branchId: 7,
        classId: 11,
        owner: { fullName: 'Xasan Diiriye' },
        vehicle: { vin: 'CHASSISX' },
      },
      11,
    );

    expect(result.plate).toBeNull();
    expect(result.registration).toBeTruthy();
  });
});

describe('VehicleRegistryService — the income report must not be one bad row from a 500', () => {
  it('skips a checkout whose items are not an array instead of raising', async () => {
    // `jsonb_array_elements` RAISES "cannot extract elements from an object" —
    // verified against a real Postgres — so a single malformed checkout would
    // take down the whole income report rather than costing it one row. Income
    // is a stated purpose of this drive; the report an office depends on should
    // not be that brittle.
    const queries: any[] = [];
    const { svc } = makeService({ queries });

    await svc.getRegistryPerformance(7);

    const revenueSql = String(
      queries.map((q) => String(q[0])).find((q) => q.includes('feeRevenue')),
    );
    expect(revenueSql).toMatch(/jsonb_typeof\(c\."items"\)\s*=\s*'array'/);
    expect(revenueSql).toMatch(/ELSE\s*'\[\]'::jsonb/);
  });

  it('reads money from the till, never from anything the registry stores', async () => {
    // A registry keeping its own copy of the money would be a second set of
    // books, and the two would disagree the first time a sale was voided.
    const queries: any[] = [];
    const { svc } = makeService({ queries });

    await svc.getRegistryPerformance(7);

    const revenueSql = String(
      queries.map((q) => String(q[0])).find((q) => q.includes('feeRevenue')),
    );
    expect(revenueSql).toContain('"pos_checkouts"');
    expect(revenueSql).toMatch(/c\."voidedAt" IS NULL/);
    expect(revenueSql).toMatch(/LIKE 'VR-%'/);
  });
});

describe('VehicleRegistryService — the desk must know which CODE it can offer', () => {
  it('reports plate stock broken down by the code the blanks carry', async () => {
    // An office total is the wrong number to gate on: allocation only hands out
    // a plate carrying the code the vehicle's class is plated under, so a
    // drawer of four hundred taxi blanks is empty as far as a truck goes.
    const rawMany = jest.fn().mockResolvedValue([
      { seriesId: '1', status: 'IN_STOCK', plateCode: '1', count: '400' },
      { seriesId: '1', status: 'ISSUED', plateCode: '1', count: '3' },
    ]);
    const { svc } = makeService({
      plateSeries: [{ id: 1, tenantId: 42, branchId: 7, prefix: '1' }],
      plateCounts: rawMany,
    });

    const stock: any = await svc.listPlateStock({ branchId: 7 });

    expect(stock[0].plateCode).toBe('1');
    expect(stock[0].remaining).toBe(400);
    expect(stock[0].byStatus.ISSUED).toBe(3);
  });

  it('tells the waiting list which code each vehicle needs', async () => {
    const queries: any[] = [];
    const { svc } = makeService({ queries });

    await svc.listAwaitingPlateNumber(7);

    expect(String(queries[0][0])).toMatch(/c\."plateCode"\s+AS "plateCode"/);
  });
});
