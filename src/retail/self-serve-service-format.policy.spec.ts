import {
  ADMIN_PROVISIONED_SERVICE_FORMAT_CODES,
  assertAllowedSelfServeServiceFormat,
  getDefaultAllowedSelfServeServiceFormats,
  resolveAllowedServiceFormatsForActor,
} from './self-serve-service-format.policy';

/**
 * The formats POS-S offers in its self-serve picker, copied from
 * SELF_SERVE_SERVICE_FORMAT_ORDER in
 * pos-s/src/features/register/registerCatalog.js.
 *
 * These two lists are a shared contract across the repos: anything the picker
 * offers but this policy rejects fails at creation with a 400 the user can do
 * nothing about — which is exactly what happened to QSR, CAFETERIA,
 * PROPERTY_RENTAL, BARBER and PRINTING_PRESS.
 */
const POS_S_SELF_SERVE_PICKER_FORMATS = [
  'QSR',
  'CAFETERIA',
  'HOTEL',
  'RETAIL',
  'PROPERTY_RENTAL',
  'BARBER',
  'PRINTING_PRESS',
  'SCHOOL',
];

describe('self-serve service format policy', () => {
  const previousFlag = process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED;
    } else {
      process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = previousFlag;
    }
  });

  it('accepts every format the POS-S picker offers once hospitality is on', () => {
    process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = '1';
    const allowed = getDefaultAllowedSelfServeServiceFormats();

    for (const format of POS_S_SELF_SERVE_PICKER_FORMATS) {
      expect(allowed).toContain(format);
      expect(assertAllowedSelfServeServiceFormat(format, 'test', allowed)).toBe(
        format,
      );
    }
  });

  it('keeps the picker formats gated behind the rollout flag', () => {
    process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = 'false';
    const allowed = getDefaultAllowedSelfServeServiceFormats();

    expect(allowed).toEqual(['RETAIL']);
    expect(() =>
      assertAllowedSelfServeServiceFormat('QSR', 'test', allowed),
    ).toThrow(/until hospitality rollout is enabled/);
  });

  /**
   * A vehicle registry office carries statutory authority — it issues plates
   * and prints a certificate a checkpoint is asked to trust. It is provisioned
   * by the platform, never picked off a signup grid. Both halves of that are
   * asserted here: nobody self-serve reaches it, and an admin can.
   */
  describe('admin-provisioned formats', () => {
    it('refuses VEHICLE_REGISTRY to an ordinary owner', () => {
      process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = '1';
      const allowed = resolveAllowedServiceFormatsForActor(null, {
        isPlatformAdmin: false,
      });

      expect(allowed).not.toContain('VEHICLE_REGISTRY');
      expect(() =>
        assertAllowedSelfServeServiceFormat(
          'VEHICLE_REGISTRY',
          'test',
          allowed,
        ),
      ).toThrow(/does not support VEHICLE_REGISTRY/);
    });

    it('lets a platform admin put a branch on it', () => {
      // Until this existed the ownership check passed for a SUPER_ADMIN and the
      // format check refused them anyway, so the region's one registry office
      // had to be written straight into the database.
      process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = '1';
      const allowed = resolveAllowedServiceFormatsForActor(null, {
        isPlatformAdmin: true,
      });

      expect(allowed).toContain('VEHICLE_REGISTRY');
      expect(
        assertAllowedSelfServeServiceFormat(
          'VEHICLE_REGISTRY',
          'test',
          allowed,
        ),
      ).toBe('VEHICLE_REGISTRY');
    });

    it('adds nothing else to what the tenant already had', () => {
      // The admin allowance is exactly the admin-provisioned list — it must not
      // become a back door around the rollout flag.
      process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = 'false';
      const asOwner = resolveAllowedServiceFormatsForActor(null, {
        isPlatformAdmin: false,
      });
      const asAdmin = resolveAllowedServiceFormatsForActor(null, {
        isPlatformAdmin: true,
      });

      expect(asOwner).toEqual(['RETAIL']);
      expect(asAdmin).toEqual([
        'RETAIL',
        ...ADMIN_PROVISIONED_SERVICE_FORMAT_CODES,
      ]);
    });

    it('is never folded into the self-serve default', () => {
      process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = '1';
      for (const code of ADMIN_PROVISIONED_SERVICE_FORMAT_CODES) {
        expect(getDefaultAllowedSelfServeServiceFormats()).not.toContain(code);
      }
    });
  });

  it('still rejects a format nothing offers', () => {
    process.env.POS_HOSPITALITY_SERVICE_FORMATS_ENABLED = '1';

    expect(() =>
      assertAllowedSelfServeServiceFormat(
        'SPACE_STATION',
        'test',
        getDefaultAllowedSelfServeServiceFormats(),
      ),
    ).toThrow(/does not support SPACE_STATION/);
  });
});
