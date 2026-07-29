import {
  assertAllowedSelfServeServiceFormat,
  getDefaultAllowedSelfServeServiceFormats,
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
