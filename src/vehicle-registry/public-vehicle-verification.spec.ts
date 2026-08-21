import { PublicVehicleVerificationService } from './public-vehicle-verification.service';
import {
  renderVehicleFormPage,
  renderVehicleResultPage,
} from './public-vehicle-verification.page';

function makeService(row: any) {
  const dataSource: any = { query: jest.fn().mockResolvedValue(row ? [row] : []) };
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
    for (const leaked of ['ownerName', 'nationalId', 'phone', 'address', 'vin']) {
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

describe('public vehicle verification — the page', () => {
  it('says its verdict in all three languages', () => {
    const html = renderVehicleResultPage({ found: true, status: 'VALID', plateNumber: '3-SM-00042' });
    expect(html).toContain('DIIWAAN GASHAN');
    expect(html).toContain('የተመዘገበ');
    expect(html).toContain('REGISTERED');
  });

  it('shouts when a vehicle is reported', () => {
    const html = renderVehicleResultPage({
      found: true, status: 'VALID', plateNumber: '3-SM-00042', flagged: true,
    });
    expect(html).toContain('CONTACT TRAFFIC POLICE');
    expect(html).toContain('ፖሊስን ያነጋግሩ');
  });

  it('does not shout when it is clean', () => {
    const html = renderVehicleResultPage({ found: true, status: 'VALID', plateNumber: '3-SM-00042' });
    expect(html).not.toContain('CONTACT TRAFFIC POLICE');
  });

  it('prints the plate in its class colours', () => {
    const html = renderVehicleResultPage({
      found: true, status: 'VALID', plateNumber: '1-SM-00007',
      plateBackgroundColour: '#c1121f', plateTextColour: '#ffffff',
    });
    expect(html).toContain('background:#c1121f');
  });

  it('escapes rather than renders anything from the record', () => {
    const html = renderVehicleResultPage({
      found: true, status: 'VALID', plateNumber: '<script>alert(1)</script>',
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
    expect(renderVehicleResultPage({ found: true, status: 'VALID' })).toContain('noindex');
  });
});
