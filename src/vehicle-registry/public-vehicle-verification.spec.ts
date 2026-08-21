import { PublicVehicleVerificationService } from './public-vehicle-verification.service';
import {
  renderVehicleFormPage,
  renderVehicleResultPage,
} from './public-vehicle-verification.page';

function makeService(row: any, previousRow: any = undefined) {
  // verifyByPlate asks twice: the issued plate, then the number the vehicle
  // used to wear. A single-answer stub cannot tell those apart.
  const dataSource: any = {
    query:
      previousRow === undefined
        ? jest.fn().mockResolvedValue(row ? [row] : [])
        : jest
            .fn()
            .mockResolvedValueOnce(row ? [row] : [])
            .mockResolvedValueOnce(previousRow ? [previousRow] : []),
  };
  return {
    svc: new PublicVehicleVerificationService({} as any, dataSource),
    dataSource,
  };
}

const base = {
  status: 'ACTIVE',
  issuedAt: new Date('2026-01-10T00:00:00Z'),
  expiresAt: new Date('2027-01-10T00:00:00Z'),
  certificateNumber: 'VR-137-00000042',
  plateNumber: '3-SM-00042',
  plateCode: '3',
  regionCode: 'SM',
  vin: 'JTDBR32E060123456',
  make: 'Toyota',
  model: 'Corolla',
  modelYear: 2014,
  colour: 'White',
  classNameEn: 'Goods truck',
  classNameSo: 'Gaadhi xamuul',
  plateBackgroundColour: '#ffffff',
  plateTextColour: '#15803d',
  issuingOffice: 'Jigjiga Zone Office',
  // A settled vehicle has its plate ON. Registrations with no fitment date are
  // a real and different state — see the plate-fitment block below.
  plateFittedAt: new Date('2026-01-10T00:00:00Z'),
  interimPermitExpiresAt: new Date('2026-02-09T00:00:00Z'),
  flagged: false,
};

describe('public vehicle verification — what a stranger is told', () => {
  it('never returns owner identity, and truncates the chassis', async () => {
    // A plate-to-owner lookup open to anyone with a phone turns every car park
    // into a directory of where people are. The last four of the chassis still
    // lets a buyer check the certificate against the stamped number, which is
    // what catches a plate moved onto a different car.
    const { svc } = makeService(base);
    const result: any = await svc.verifyByPlate('3-SM-00042');

    expect(result.vinLast4).toBe('3456');
    expect(JSON.stringify(result)).not.toContain('JTDBR32E060123456');
    for (const leaked of [
      'ownerName',
      'nationalId',
      'phone',
      'address',
      'vin',
    ]) {
      expect(Object.keys(result)).not.toContain(leaked);
    }
  });

  it('reports EXPIRED from the DATE even when the row still says ACTIVE', async () => {
    // Nothing sweeps registrations to EXPIRED — there is no nightly job — so a
    // lapsed licence still reads ACTIVE in the database. Trusting that column
    // would tell a checkpoint a lapsed vehicle is valid, which is the one
    // answer this page must never give.
    const { svc } = makeService({
      ...base,
      status: 'ACTIVE',
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect((await svc.verifyByPlate('3-SM-00042')).status).toBe('EXPIRED');
  });

  it('reports a live registration as valid', async () => {
    const { svc } = makeService({
      ...base,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect((await svc.verifyByPlate('3-SM-00042')).status).toBe('VALID');
  });

  it.each([
    ['SUSPENDED', 'SUSPENDED'],
    ['DEREGISTERED', 'DEREGISTERED'],
    ['TRANSFERRED', 'DEREGISTERED'],
    ['PENDING_ISSUE', 'PENDING'],
  ])('maps %s to %s', async (stored, shown) => {
    const { svc } = makeService({ ...base, status: stored });
    expect((await svc.verifyByPlate('x')).status).toBe(shown);
  });

  it('answers "no record" rather than throwing on a miss', async () => {
    const { svc } = makeService(null);
    const result = await svc.verifyByCode('NOSUCHCODE1234');
    expect(result).toEqual({ found: false, status: 'NOT_REGISTERED' });
  });

  it('refuses an empty lookup without hitting the database', async () => {
    const { svc, dataSource } = makeService(base);
    expect((await svc.verifyByPlate('   ')).found).toBe(false);
    expect((await svc.verifyByCode('')).found).toBe(false);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('surfaces that a vehicle is flagged, without saying why', async () => {
    // A checkpoint needs to know to stop the car. The case reference, the
    // reporting officer and the note are for the authenticated view — a public
    // page that printed them would tell a thief exactly what is known.
    const { svc } = makeService({ ...base, flagged: true });
    const result = await svc.verifyByPlate('3-SM-00042');
    expect(result.flagged).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/reference|note|raisedBy/i);
  });
});

describe('public vehicle verification — cars still wearing the old number', () => {
  it('resolves the number a vehicle used to carry', async () => {
    // During the drive most cars on the road still wear their old number, so an
    // officer reading a bumper types THAT one. A portal that only knew plates we
    // had issued would be useless for most of the fleet it exists to cover.
    const { svc } = makeService(null, {
      ...base,
      presentedPlateNumber: '3-SM-00042',
      plateNumber: '2-SM-00001',
      expiresAt: new Date(Date.now() + 86_400_000),
      plateFittedAt: new Date('2026-01-10T00:00:00Z'),
    });

    const result = await svc.verifyByPlate('3-SM-00042');
    expect(result.found).toBe(true);
    expect(result.status).toBe('VALID');
    expect(result.matchedOnPreviousNumber).toBe(true);
    expect(result.previousPlateNumber).toBe('3-SM-00042');
    // And it reports the plate the vehicle SHOULD now be wearing.
    expect(result.plateNumber).toBe('2-SM-00001');
  });

  it('prefers the issued plate when both could match', async () => {
    const { svc } = makeService({ ...base, plateNumber: '2-SM-00001' }, null);
    const result = await svc.verifyByPlate('2-SM-00001');
    expect(result.matchedOnPreviousNumber).toBeUndefined();
  });

  it('tells the reader plainly that the plate has changed', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      plateNumber: '2-SM-00001',
      previousPlateNumber: '3-SM-00042',
      matchedOnPreviousNumber: true,
    });
    expect(html).toContain('3-SM-00042');
    expect(html).toContain('2-SM-00001');
    expect(html).toMatch(/used to carry/i);
  });

  it('says nothing about a swap for a vehicle on its issued plate', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      plateNumber: '2-SM-00001',
    });
    expect(html).not.toMatch(/used to carry/i);
  });
});

describe('public vehicle verification — registered with no plate number', () => {
  // The NORMAL state for this drive. A real number is obtained by the Bureau
  // applying to the Federal Trade Ministry, not handed over at the counter, so
  // most registered vehicles legitimately have none.

  it('answers the question it exists to answer: yes, this is registered', async () => {
    const { svc } = makeService({
      ...base,
      plateNumber: null,
      plateFittedAt: null,
      presentedPlateNumber: '3-SM-00042',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect((await svc.verifyByPlate('x')).status).toBe('REGISTERED_NO_PLATE');
  });

  it('shows it GREEN, because nothing is wrong with the vehicle', () => {
    // Colouring it as a problem would tell an officer something is wrong with a
    // vehicle whose paperwork is in perfect order.
    const html = renderVehicleResultPage({
      found: true,
      status: 'REGISTERED_NO_PLATE',
      previousPlateNumber: '3-SM-00042',
    });
    expect(html).toContain('#166534');
    expect(html).toMatch(/This vehicle IS registered/i);
    // Whitespace-tolerant: the template wraps its lines, so asserting a single
    // space between words tests the indentation rather than the sentence.
    expect(html).toMatch(/has not been\s+issued yet/i);
    expect(html).toContain('3-SM-00042');
  });

  it('says what the car is wearing even on a direct certificate scan', async () => {
    // The previous-number notice used to appear only when the SEARCH matched on
    // it. An officer scanning the QR of a vehicle with no official number was
    // told it was registered and nothing about the plate in front of them.
    const { svc } = makeService({
      ...base,
      plateNumber: null,
      plateFittedAt: null,
      presentedPlateNumber: '3-SM-09999',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const result = await svc.verifyByCode('P4R7WXY2QM8NB3');
    expect(result.status).toBe('REGISTERED_NO_PLATE');
    expect(result.previousPlateNumber).toBe('3-SM-09999');
  });

  it('an expired licence still outranks a missing plate number', async () => {
    const { svc } = makeService({
      ...base,
      plateNumber: null,
      plateFittedAt: null,
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect((await svc.verifyByPlate('x')).status).toBe('EXPIRED');
  });

  it('finds a vehicle by its chassis when it has no number of any kind', async () => {
    // With no official plate and no invented one, the stamped chassis is the
    // only identity the car carries.
    const dataSource: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce([]) // no issued plate
        .mockResolvedValueOnce([]) // no previous number
        .mockResolvedValueOnce([
          { ...base, plateNumber: null, plateFittedAt: null },
        ]),
    };
    const svc = new PublicVehicleVerificationService({} as any, dataSource);
    const result = await svc.verifyByPlate('JTDBR32E060123456');
    expect(result.found).toBe(true);
    expect(dataSource.query).toHaveBeenCalledTimes(3);
  });
});

describe('public vehicle verification — the plate-fitting window', () => {
  // Issuance and fitting are different moments. Between them the record says
  // one number and the car wears another, which is indistinguishable from a
  // swapped plate — and is where a stolen vehicle is easiest to move.

  it('does not say "registered" while the plate is still not on the car', async () => {
    const { svc } = makeService({
      ...base,
      plateFittedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      interimPermitExpiresAt: new Date(Date.now() + 86_400_000),
    });
    const result = await svc.verifyByPlate('x');
    expect(result.status).toBe('AWAITING_PLATE');
  });

  it('reports OVERDUE once the interim permit has run out', async () => {
    const { svc } = makeService({
      ...base,
      plateFittedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      interimPermitExpiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect((await svc.verifyByPlate('x')).status).toBe('PLATE_OVERDUE');
  });

  it('says VALID once the plate is confirmed fitted', async () => {
    const { svc } = makeService({
      ...base,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect((await svc.verifyByPlate('x')).status).toBe('VALID');
  });

  it('lets an EXPIRED licence outrank an unfitted plate', async () => {
    // A lapsed registration is the more serious fact, and reporting it as
    // merely awaiting a plate would understate it.
    const { svc } = makeService({
      ...base,
      plateFittedAt: null,
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect((await svc.verifyByPlate('x')).status).toBe('EXPIRED');
  });

  it('tells the reader which plate the vehicle should be carrying', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'AWAITING_PLATE',
      plateNumber: '2-SM-00001',
      previousPlateNumber: '3-SM-00042',
      interimPermitExpiresAt: new Date('2026-09-20T00:00:00Z'),
    });
    expect(html).toContain('PLATE NOT YET FITTED');
    expect(html).toContain('2-SM-00001');
    expect(html).toContain('3-SM-00042');
    // Not pinning the month abbreviation: Node's ICU renders September as
    // "Sept" in some versions and "Sep" in others, and a test that fails on a
    // runtime upgrade is a test people learn to ignore.
    expect(html).toMatch(/Permitted until 20 Sep\w* 2026/);
  });

  it('refers an overdue vehicle to the office rather than accusing the driver', () => {
    // The office may simply not have produced the plate. A driver should not
    // carry the consequence of the office's backlog.
    const html = renderVehicleResultPage({
      found: true,
      status: 'PLATE_OVERDUE',
      plateNumber: '2-SM-00001',
    });
    expect(html).toContain('PLATE OVERDUE');
    expect(html).toMatch(/refer the driver to the issuing office/i);
    expect(html).not.toMatch(/illegal|unlawful|offence/i);
  });
});

describe('public vehicle verification — the page', () => {
  it('says its verdict in all three languages', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      plateNumber: '3-SM-00042',
    });
    expect(html).toContain('DIIWAAN GASHAN');
    expect(html).toContain('የተመዘገበ');
    expect(html).toContain('REGISTERED');
  });

  it('shouts when a vehicle is reported', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      plateNumber: '3-SM-00042',
      flagged: true,
    });
    expect(html).toContain('CONTACT TRAFFIC POLICE');
    expect(html).toContain('ፖሊስን ያነጋግሩ');
  });

  it('does not shout when it is clean', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      plateNumber: '3-SM-00042',
    });
    expect(html).not.toContain('CONTACT TRAFFIC POLICE');
  });

  it('prints the plate in its class colours', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      plateNumber: '1-SM-00007',
      plateBackgroundColour: '#c1121f',
      plateTextColour: '#ffffff',
    });
    expect(html).toContain('background:#c1121f');
  });

  it('escapes rather than renders anything from the record', () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      plateNumber: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('carries no JavaScript at all', () => {
    // The reader is at a roadside on someone else's phone. A single small
    // document renders before a framework would have finished downloading.
    const html = renderVehicleResultPage({ found: true, status: 'VALID' });
    expect(html).not.toMatch(/<script/i);
    expect(renderVehicleFormPage()).not.toMatch(/<script/i);
  });

  it('tells a reader plainly that owner details are withheld', () => {
    const html = renderVehicleResultPage({ found: true, status: 'VALID' });
    expect(html).toMatch(/Owner details are not shown/i);
  });

  it('asks search engines not to index a lookup result', () => {
    expect(renderVehicleResultPage({ found: true, status: 'VALID' })).toContain(
      'noindex',
    );
  });
});

/**
 * Two cars, one invented number.
 *
 * The registry deliberately does NOT make presented numbers unique — refusing
 * the second car would send it away still wearing the fake plate, which is the
 * opposite of the point of the drive. So the collision has to surface at the
 * only place a member of the public meets it: the lookup.
 */
describe('public vehicle verification — a number worn by more than one vehicle', () => {
  const first = {
    ...base,
    plateNumber: null,
    plateCode: null,
    regionCode: null,
    plateFittedAt: null,
    interimPermitExpiresAt: null,
    presentedPlateNumber: '3-SM-09999',
    make: 'Toyota',
    model: 'Corolla',
  };

  function withDuplicates(n: number) {
    const dataSource: any = {
      query: jest
        .fn()
        // issued-plate lookup: nothing
        .mockResolvedValueOnce([])
        // previous-number lookup: the first of them
        .mockResolvedValueOnce([first])
        // the count
        .mockResolvedValueOnce([{ n }]),
    };
    return new PublicVehicleVerificationService({} as any, dataSource);
  }

  it('refuses to name one vehicle when several carry the number', async () => {
    // Naming a single record would be a guess dressed as an answer: an officer
    // whose car does not match concludes the plate is stolen, and one whose car
    // happens to match is waved through without anybody noticing the number is
    // shared.
    const result: any = await withDuplicates(3).verifyByPlate('3-SM-09999');

    expect(result.found).toBe(true);
    expect(result.status).toBe('DUPLICATE_PRESENTED_NUMBER');
    expect(result.duplicateCount).toBe(3);
    expect(result.make).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.certificateNumber).toBeUndefined();
  });

  it('answers normally when exactly one vehicle carries it', async () => {
    const result: any = await withDuplicates(1).verifyByPlate('3-SM-09999');

    expect(result.status).toBe('REGISTERED_NO_PLATE');
    expect(result.make).toBe('Toyota');
  });

  it('counts vehicles, not registration rows', async () => {
    // Defensive rather than load-bearing: a partial unique index already allows
    // one ACTIVE registration per vehicle, so the two spellings agree today.
    // Verified against the real schema — an attempt to insert a second ACTIVE
    // registration for one vehicle is refused by
    // `uq_pos_vehicle_registrations_active_vehicle`. This pins the safer
    // spelling so that relaxing the constraint later cannot quietly turn every
    // renewed vehicle into a "duplicate plate" warning.
    const dataSource: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([first])
        .mockResolvedValueOnce([{ n: 1 }]),
    };
    const svc = new PublicVehicleVerificationService({} as any, dataSource);
    await svc.verifyByPlate('3-SM-09999');

    const countSql = String(dataSource.query.mock.calls[2][0]);
    expect(countSql).toMatch(/count\(DISTINCT v\."id"\)/);
  });

  it('tells the reader to read the chassis, in all three languages', async () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'DUPLICATE_PRESENTED_NUMBER',
      previousPlateNumber: '3-SM-09999',
      matchedOnPreviousNumber: true,
      duplicateCount: 2,
    } as any);

    expect(html).toContain('3-SM-09999');
    expect(html).toMatch(/chassis/i);
    expect(html).toContain('ሻሲ');
    expect(html).toContain('chassis-ka');
    // No vehicle to describe, so no empty detail table pretending there is one.
    expect(html).not.toMatch(/Issuing office/);
  });

  it('does not accuse the driver of anything', async () => {
    // The number was invented by somebody, but the person holding this car may
    // have bought it in good faith — and the registry has no idea which of the
    // vehicles is which. Wording that says "illegal" convicts whoever happens
    // to be stopped first.
    const html = renderVehicleResultPage({
      found: true,
      status: 'DUPLICATE_PRESENTED_NUMBER',
      previousPlateNumber: '3-SM-09999',
      duplicateCount: 2,
    } as any);

    expect(html).not.toMatch(/illegal|unlawful|offence|fraud|criminal/i);
  });
});

describe('public vehicle verification — the blank-plate notice', () => {
  it('does not claim a registered plate the vehicle does not have', async () => {
    // A vehicle registered without a number matches on its old one AND has a
    // null plate, so the "its registered plate is now X" notice printed a BLANK
    // where the answer should be — on the one line the reader is looking for.
    const html = renderVehicleResultPage({
      found: true,
      status: 'REGISTERED_NO_PLATE',
      matchedOnPreviousNumber: true,
      previousPlateNumber: '3-SM-09999',
      plateNumber: null,
    } as any);

    expect(html).not.toMatch(/registered plate is now/);
    expect(html).toMatch(/has not been\s+issued yet/);
    expect(html).toContain('3-SM-09999');
  });

  it('still shows the swap notice when there IS a new plate', async () => {
    const html = renderVehicleResultPage({
      found: true,
      status: 'VALID',
      matchedOnPreviousNumber: true,
      previousPlateNumber: '3-SM-09999',
      plateNumber: '2-SM-00001',
      plateFittedAt: new Date('2026-01-10T00:00:00Z'),
    } as any);

    expect(html).toMatch(/registered plate is now/);
    expect(html).toContain('2-SM-00001');
  });
});
