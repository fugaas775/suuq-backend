import {
  ETHIOPIAN_PLATE_CLASSES,
  ETHIOPIAN_REGIONS,
  SOMALI_REGION_CODE,
  formatPlateNumber,
  plateColoursFor,
} from './ethiopian-plates';

/**
 * The vocabulary the first cut of this registry got wrong.
 */
describe('Ethiopian plate vocabulary', () => {
  it('knows the Somali Region is SM, not a number', () => {
    // The original seed used prefix '5' for the Somali Region. 5 is the CLASS
    // code for religious and civic bodies; the region is ሶማ / SM. Conflating a
    // class code with a region code is what this whole module exists to stop.
    expect(SOMALI_REGION_CODE).toBe('SM');
    expect(ETHIOPIAN_REGIONS.SM.labelEn).toBe('Somali Region');
    expect(ETHIOPIAN_REGIONS.SM.am).toBe('ሶማ');
    expect(ETHIOPIAN_PLATE_CLASSES['5'].labelEn).toBe('Religious & civic');
  });

  it('carries all ten region codes', () => {
    expect(Object.keys(ETHIOPIAN_REGIONS).sort()).toEqual(
      ['AA', 'AF', 'AM', 'BG', 'DR', 'ET', 'GM', 'HR', 'OR', 'SM'].sort(),
    );
  });

  it('maps each numbered class to its plate colours', () => {
    // Colour is how an officer reads a category from thirty metres, so it is
    // registry data. A taxi is the only class with a coloured FIELD; the rest
    // are white with coloured lettering.
    expect(plateColoursFor('1')).toEqual({ background: '#c1121f', text: '#ffffff' });
    expect(plateColoursFor('2').text).toBe('#1d4ed8'); // private — blue
    expect(plateColoursFor('3').text).toBe('#15803d'); // commercial — green
    expect(plateColoursFor('4').text).toBe('#111827'); // government — black
    expect(plateColoursFor('5').text).toBe('#c2410c'); // civic — orange
  });

  it('falls back to an ordinary white plate for an unknown code', () => {
    expect(plateColoursFor('nonsense')).toEqual({ background: '#ffffff', text: '#111827' });
    expect(plateColoursFor(null)).toEqual({ background: '#ffffff', text: '#111827' });
  });

  it('composes a plate from its three parts', () => {
    expect(formatPlateNumber('3', 'SM', 1234)).toBe('3-SM-01234');
    expect(formatPlateNumber('2', 'sm', 7, 5)).toBe('2-SM-00007');
    // A class whose code is not a digit still composes.
    expect(formatPlateNumber('ፖሊስ', 'SM', 42)).toBe('ፖሊስ-SM-00042');
  });

  it('never loses the serial to a narrow width', () => {
    // padStart only pads; a serial wider than the field must not be truncated,
    // because a truncated plate number is a different vehicle.
    expect(formatPlateNumber('3', 'SM', 123456, 5)).toBe('3-SM-123456');
  });
});
