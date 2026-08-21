/**
 * The Ethiopian licence-plate vocabulary.
 *
 * Two independent identifiers appear on every plate, and conflating them is the
 * mistake this file exists to prevent: the first cut of the registry seeded the
 * Somali Region with prefix '5', which is not a region at all — it is the CLASS
 * code for religious and civic bodies.
 *
 *   CLASS  says what the vehicle is FOR. It is about use and ownership, not
 *          body shape: a minibus driven as a taxi is code 1, the same minibus
 *          owned privately is code 2, and a truck on hire is code 3.
 *   REGION says who issued it.
 *
 * The class also fixes the plate's colours, which is how an officer reads a
 * vehicle's category from thirty metres — red is a taxi, green lettering is
 * commercial, orange is an NGO. That makes colour registry data rather than
 * styling, so it is defined here and stored on the class.
 *
 * Source: metaappz.com/References/Ethiopian_licence_plates, supplied by the
 * Bureau. The one thing it does not state is the ARRANGEMENT of code, region
 * and serial on the plate face — see formatPlateNumber below.
 */

export interface EthiopianPlateClass {
  /** The code as it appears on the plate. */
  code: string;
  labelEn: string;
  labelSo: string;
  labelAm: string;
  /** CSS colours, used on the certificate and the windscreen sticker. */
  background: string;
  text: string;
}

export const ETHIOPIAN_PLATE_CLASSES: Record<string, EthiopianPlateClass> = {
  '1': {
    code: '1',
    labelEn: 'Taxi',
    labelSo: 'Tagsi',
    labelAm: 'ታክሲ',
    // The only class with a coloured field rather than coloured lettering.
    background: '#c1121f',
    text: '#ffffff',
  },
  '2': {
    code: '2',
    labelEn: 'Private',
    labelSo: 'Gaar ahaaneed',
    labelAm: 'የግል',
    background: '#ffffff',
    text: '#1d4ed8',
  },
  '3': {
    code: '3',
    labelEn: 'Commercial',
    labelSo: 'Ganacsi',
    labelAm: 'የንግድ',
    background: '#ffffff',
    text: '#15803d',
  },
  '4': {
    code: '4',
    labelEn: 'Government',
    labelSo: 'Dowladda',
    labelAm: 'የመንግስት',
    background: '#ffffff',
    text: '#111827',
  },
  '5': {
    code: '5',
    labelEn: 'Religious & civic',
    labelSo: 'Diini iyo bulsho',
    labelAm: 'ሃይማኖታዊ እና ማህበራዊ',
    background: '#ffffff',
    text: '#c2410c',
  },
  POLICE: {
    code: 'ፖሊስ',
    labelEn: 'Police',
    labelSo: 'Booliska',
    labelAm: 'ፖሊስ',
    background: '#facc15',
    text: '#111827',
  },
  UN: {
    code: 'UN',
    labelEn: 'United Nations',
    labelSo: 'Qaramada Midoobay',
    labelAm: 'የተመ',
    background: '#bfdbfe',
    text: '#111827',
  },
  AU: {
    code: 'AU',
    labelEn: 'African Union',
    labelSo: 'Midowga Afrika',
    labelAm: 'አሕ',
    background: '#bbf7d0',
    text: '#111827',
  },
  TEMPORARY: {
    code: 'ተላላፊ',
    labelEn: 'Temporary',
    labelSo: 'Ku meel gaar',
    labelAm: 'ተላላፊ',
    background: '#bfdbfe',
    text: '#111827',
  },
};

/** Region codes, Latin and Amharic. */
export const ETHIOPIAN_REGIONS: Record<string, { am: string; labelEn: string }> = {
  ET: { am: 'ኢት', labelEn: 'Ethiopia (national)' },
  AA: { am: 'አአ', labelEn: 'Addis Ababa' },
  AF: { am: 'አፋ', labelEn: 'Afar' },
  AM: { am: 'አማ', labelEn: 'Amhara' },
  BG: { am: 'ቤጉ', labelEn: 'Benishangul Gumuz' },
  DR: { am: 'ድሬ', labelEn: 'Dire Dawa' },
  GM: { am: 'ጋም', labelEn: 'Gambela' },
  HR: { am: 'ሐረ', labelEn: 'Harar' },
  OR: { am: 'ኦሮ', labelEn: 'Oromia' },
  SM: { am: 'ሶማ', labelEn: 'Somali Region' },
};

/** The bureau this registry was built for. */
export const SOMALI_REGION_CODE = 'SM';

export const DEFAULT_PLATE_SERIAL_WIDTH = 5;

/**
 * Compose the printed plate number.
 *
 * ⚠ THE ARRANGEMENT IS AN ASSUMPTION. The Bureau's own reference lists the
 * class codes and the region codes but does not state how they sit on the plate
 * face. `code-region-serial` is the common written rendering, and it is used
 * here because a plate has to print as SOMETHING.
 *
 * The components are stored separately on every plate row precisely so this is
 * cheap to correct: if the Bureau says the order differs, this function changes
 * and the data does not. Nothing anywhere parses the composed string to get the
 * parts back — that is the coupling this exists to avoid.
 */
export function formatPlateNumber(
  plateCode: string,
  regionCode: string,
  serial: number,
  width: number = DEFAULT_PLATE_SERIAL_WIDTH,
): string {
  const code = String(plateCode || '').trim();
  const region = String(regionCode || '').trim().toUpperCase();
  const number = String(serial).padStart(width, '0');
  return [code, region, number].filter(Boolean).join('-');
}

/** Colours for a class code, falling back to the ordinary white plate. */
export function plateColoursFor(plateCode: string | null | undefined) {
  const key = String(plateCode || '').trim().toUpperCase();
  const found =
    ETHIOPIAN_PLATE_CLASSES[key] ||
    Object.values(ETHIOPIAN_PLATE_CLASSES).find((c) => c.code === key);
  return {
    background: found?.background ?? '#ffffff',
    text: found?.text ?? '#111827',
  };
}
