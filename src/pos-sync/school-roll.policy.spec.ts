import {
  isEmptySchoolBasket,
  normalizeAdmissionNo,
  schoolAdmissionNoOf,
  schoolPupilShapeProblem,
} from './school-roll.policy';

/**
 * The three rules a students table would have enforced for free, applied to
 * a suspended cart wearing hotel field names. Every one of them was broken
 * live before this existed.
 */
const school = (snap: Record<string, unknown>) => ({
  cartSnapshot: { serviceFormat: 'SCHOOL', ...snap },
});

describe('isEmptySchoolBasket', () => {
  it('is the folio found live: no pupil, no lines, no application', () => {
    expect(isEmptySchoolBasket(school({ cartLines: [] }))).toBe(true);
    expect(isEmptySchoolBasket(school({}))).toBe(true);
  });

  it('is not a pupil, a basket with lines, or a public application', () => {
    expect(isEmptySchoolBasket(school({ hotelGuestName: 'Amina' }))).toBe(
      false,
    );
    expect(
      isEmptySchoolBasket(school({ cartLines: [{ name: 'Uniform' }] })),
    ).toBe(false);
    expect(isEmptySchoolBasket(school({ consumerOrder: true }))).toBe(false);
  });

  it('never fires on another format', () => {
    expect(
      isEmptySchoolBasket({ cartSnapshot: { serviceFormat: 'HOTEL' } }),
    ).toBe(false);
    expect(isEmptySchoolBasket({ cartSnapshot: {} })).toBe(false);
    expect(isEmptySchoolBasket(null)).toBe(false);
  });
});

describe('schoolPupilShapeProblem', () => {
  it('refuses a pupil with no class, by name', () => {
    expect(
      schoolPupilShapeProblem(school({ hotelGuestName: 'Amina Cali' })),
    ).toMatch(/Amina Cali has no class/);
    expect(
      schoolPupilShapeProblem(
        school({ hotelGuestName: 'Amina Cali', hotelRoomNumber: '  ' }),
      ),
    ).toMatch(/no class/);
  });

  it('accepts a pupil in a class', () => {
    expect(
      schoolPupilShapeProblem(
        school({ hotelGuestName: 'Amina Cali', hotelRoomNumber: '3aad' }),
      ),
    ).toBeNull();
  });

  it('leaves a basket with no pupil, an application, and other formats alone', () => {
    expect(schoolPupilShapeProblem(school({ cartLines: [] }))).toBeNull();
    expect(
      schoolPupilShapeProblem(
        school({ hotelGuestName: 'Applicant', consumerOrder: true }),
      ),
    ).toBeNull();
    expect(
      schoolPupilShapeProblem({
        cartSnapshot: { serviceFormat: 'HOTEL', hotelGuestName: 'Guest' },
      }),
    ).toBeNull();
  });
});

describe('schoolAdmissionNoOf / normalizeAdmissionNo', () => {
  it('folds case and whitespace, as every SCHOOL reader keys it', () => {
    expect(normalizeAdmissionNo('  SMAK-0150 ')).toBe('smak-0150');
    expect(normalizeAdmissionNo(null)).toBe('');
  });

  it('answers only for a pupil folio', () => {
    expect(
      schoolAdmissionNoOf(
        school({ hotelGuestName: 'Amina', schoolAdmissionNo: 'SMAG-0201' }),
      ),
    ).toBe('smag-0201');
    // A pupil the school has not numbered has nothing to collide on.
    expect(schoolAdmissionNoOf(school({ hotelGuestName: 'Amina' }))).toBe('');
    // Not a pupil.
    expect(
      schoolAdmissionNoOf(school({ schoolAdmissionNo: 'SMAG-0201' })),
    ).toBe('');
    expect(
      schoolAdmissionNoOf(
        school({
          hotelGuestName: 'Applicant',
          consumerOrder: true,
          schoolAdmissionNo: 'X',
        }),
      ),
    ).toBe('');
  });
});
