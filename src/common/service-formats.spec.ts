import {
  ALL_SERVICE_FORMAT_CODES,
  CATALOG_LISTABLE_SERVICE_FORMAT_CODES,
  CONSUMER_FORMAT_ORDER_MODES,
  CONSUMER_ORDERABLE_SERVICE_FORMAT_CODES,
  SELF_SERVE_SERVICE_FORMAT_CODES,
  SERVICE_FORMATS,
  getServiceFormat,
  modeNeedsBrief,
  modeNeedsCart,
  modeNeedsTime,
  serviceFormatLabel,
} from './service-formats';
import { SellerBranchServiceFormat } from '../seller-workspace/dto/create-seller-branch-workspace.dto';

/**
 * The registry is only useful if the other declarations actually agree with it.
 * These tests are the tripwire: they fail when someone adds a format to one
 * surface and forgets the rest, which is how the vocabulary drifted apart before.
 */
describe('service format registry', () => {
  it('has no duplicate codes', () => {
    expect(new Set(ALL_SERVICE_FORMAT_CODES).size).toBe(
      ALL_SERVICE_FORMAT_CODES.length,
    );
  });

  it('covers every format POS-S can create', () => {
    const sellerFormats = Object.values(SellerBranchServiceFormat);
    const missing = sellerFormats.filter(
      (code) => !ALL_SERVICE_FORMAT_CODES.includes(code),
    );
    // A creatable format with no registry entry renders in the Consumer app
    // with no label and no store page.
    expect(missing).toEqual([]);
  });

  it('marks exactly the seller-creatable formats as self-serve creatable', () => {
    expect([...SELF_SERVE_SERVICE_FORMAT_CODES].sort()).toEqual(
      Object.values(SellerBranchServiceFormat).sort(),
    );
  });

  it('lets a guest send every known format a request', () => {
    // The point of the platform-wide inbox: a branch POS-S can create must not
    // render a store page that dead-ends. If this fails, a format was added
    // without deciding what a guest may ask it for.
    expect([...CONSUMER_ORDERABLE_SERVICE_FORMAT_CODES].sort()).toEqual(
      [...ALL_SERVICE_FORMAT_CODES].sort(),
    );
  });

  it('gives every orderable format at least one order mode', () => {
    for (const format of SERVICE_FORMATS) {
      expect(format.consumerOrderable).toBe(true);
      expect(CONSUMER_FORMAT_ORDER_MODES[format.code].length).toBeGreaterThan(
        0,
      );
    }
  });

  it('keeps non-shoppable formats out of the cross-shop catalog', () => {
    // A room, a rented unit, a print job and a school place are asked about,
    // not bought from a grid. This set used to be inferred from "accepts orders
    // in some mode other than BOOKING", which silently admitted the print shop
    // and the school the moment they became orderable.
    expect([...CATALOG_LISTABLE_SERVICE_FORMAT_CODES].sort()).toEqual(
      [
        'BAKERY',
        'BARBER',
        'BUTCHERY',
        'CAFETERIA',
        'ELECTRONICS',
        'FSR',
        'GAS_STATION',
        'GROCERY',
        'LAUNDRY',
        'OTHER',
        'PHARMACY',
        'QSR',
        'RETAIL',
        'SALON_SPA',
      ].sort(),
    );
    for (const code of [
      'HOTEL',
      'PROPERTY_RENTAL',
      'PRINTING_PRESS',
      'SCHOOL',
    ]) {
      expect(getServiceFormat(code)?.catalogListable).toBe(false);
      expect(getServiceFormat(code)?.consumerOrderable).toBe(true);
    }
  });

  it('knows which modes carry a basket, a brief and a time', () => {
    // A barber's haircut is a priced shelf item, so an appointment still fills
    // a cart. The two that do not are the ones that cannot be picked off a list.
    expect(modeNeedsCart('TAKEAWAY')).toBe(true);
    expect(modeNeedsCart('APPOINTMENT')).toBe(true);
    expect(modeNeedsCart('SCHEDULED')).toBe(true);
    expect(modeNeedsCart('QUOTE')).toBe(false);
    expect(modeNeedsCart('BOOKING')).toBe(false);

    expect(modeNeedsBrief('QUOTE')).toBe(true);
    expect(modeNeedsBrief('TAKEAWAY')).toBe(false);

    expect(modeNeedsTime('BOOKING')).toBe(true);
    expect(modeNeedsTime('QUOTE')).toBe(false);
  });

  it('labels the formats that used to have none', () => {
    // These are creatable in POS-S; before the registry they reached the app
    // unlabelled.
    expect(serviceFormatLabel('PROPERTY_RENTAL')).toBe('Property Rental');
    expect(serviceFormatLabel('PRINTING_PRESS')).toBe('Printing Press');
    expect(serviceFormatLabel('FSR')).toBe('Restaurant');
    expect(serviceFormatLabel('SCHOOL')).toBe('School');
  });

  it('resolves codes case-insensitively and falls back readably', () => {
    expect(getServiceFormat('hotel')?.code).toBe('HOTEL');
    expect(getServiceFormat('  QSR ')?.code).toBe('QSR');
    expect(getServiceFormat('NOT_A_FORMAT')).toBeNull();
    // An unknown code still reads as something rather than blank.
    expect(serviceFormatLabel('NOT_A_FORMAT')).toBe('NOT_A_FORMAT');
    expect(serviceFormatLabel(null)).toBe('Business');
  });
});
