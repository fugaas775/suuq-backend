import {
  ALL_SERVICE_FORMAT_CODES,
  CONSUMER_FORMAT_ORDER_MODES,
  CONSUMER_ORDERABLE_SERVICE_FORMAT_CODES,
  SELF_SERVE_SERVICE_FORMAT_CODES,
  SERVICE_FORMATS,
  getServiceFormat,
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

  it('keeps the consumer-orderable set frozen to what shipped', () => {
    // Consumer→POS ordering is frozen. Widening this set opens a new ordering
    // surface, which this roadmap explicitly does not do. If this fails, someone
    // gave a format order modes without meaning to.
    expect([...CONSUMER_ORDERABLE_SERVICE_FORMAT_CODES]).toEqual([
      'RETAIL',
      'GROCERY',
      'PHARMACY',
      'BAKERY',
      'BUTCHERY',
      'ELECTRONICS',
      'GAS_STATION',
      'QSR',
      'CAFETERIA',
      'BARBER',
      'SALON_SPA',
      'LAUNDRY',
      'HOTEL',
      'OTHER',
    ]);
  });

  it('gives every orderable format at least one order mode, and none to the rest', () => {
    for (const format of SERVICE_FORMATS) {
      if (format.consumerOrderable) {
        expect(CONSUMER_FORMAT_ORDER_MODES[format.code].length).toBeGreaterThan(
          0,
        );
      } else {
        expect(CONSUMER_FORMAT_ORDER_MODES[format.code]).toBeUndefined();
        expect(format.orderModes).toEqual([]);
      }
    }
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
