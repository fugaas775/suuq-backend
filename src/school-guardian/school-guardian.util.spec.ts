import {
  dedupeUsername,
  folioMoney,
  guardianFolioView,
  guardianReceiptView,
  isPupilRecord,
  localDayIn,
  noticeIsLive,
  noticeReaches,
  normalizePhoneKey,
  pupilOf,
  rankClassByTerm,
  readReports,
  reportPercent,
  schoolTimeZone,
  suggestGuardianUsername,
  usernameFromName,
} from './school-guardian.util';

const pupil = (
  over: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
) => ({
  id: 10422,
  branchId: 128,
  status: 'SUSPENDED',
  total: 2500,
  label: 'x',
  currency: 'ETB',
  itemCount: 2,
  metadata: meta,
  cartSnapshot: {
    serviceFormat: 'SCHOOL',
    hotelGuestName: 'Faadumo Cali',
    hotelRoomNumber: '3aad',
    schoolAdmissionNo: 'SMAG-0127',
    schoolGuardianName: 'Cali Xasan',
    hotelGuestPhone: '+251 915 333 513',
    hotelCheckInAt: '2026-09-12T08:00:00.000Z',
    schoolStatusBy: 'Office',
    schoolStatusHistory: [{ by: 'Office' }],
    schoolLeavingBills: [{ on: '2026-09-27', by: 'Suuq S', waived: 500 }],
    schoolClassHistory: [{ from: '2aad', to: '3aad', by: 'Fuad' }],
    settledBy: 'Hibo',
    settledByName: 'Hibo',
    paidBy: 'Hibo',
    openedByName: 'Hibo',
    lastSettledByUserId: 77,
    ...over,
  },
});

describe('school-guardian.util', () => {
  it('folds a phone to digits, +251 to the local form, and suggests it as the username', () => {
    expect(normalizePhoneKey('+251 915 333 513')).toBe('0915333513');
    expect(normalizePhoneKey('0915-333-513')).toBe('0915333513');
    expect(normalizePhoneKey('')).toBe('');
    expect(
      suggestGuardianUsername({
        phone: '+251915333513',
        guardianName: 'Cali Xasan',
      }),
    ).toBe('0915333513');
    // Too short a phone → the name.
    expect(
      suggestGuardianUsername({
        phone: '1234',
        guardianName: 'Cali Xasan Warsame',
      }),
    ).toBe('cali.warsame');
    expect(usernameFromName('  Ali ')).toBe('ali');
    expect(suggestGuardianUsername({ phone: '', guardianName: 'Al' })).toBe('');
  });

  it('de-duplicates a taken username with a numeric suffix', () => {
    const taken = new Set(['0915333513', '0915333513.2']);
    expect(dedupeUsername('0915333513', taken)).toBe('0915333513.3');
    expect(dedupeUsername('free', taken)).toBe('free');
  });

  it('reads a pupil the way the roll does, and knows a leaver and a withdrawn record', () => {
    expect(pupilOf(pupil())).toMatchObject({
      folioId: 10422,
      name: 'Faadumo Cali',
      classCode: '3aad',
      admissionNo: 'SMAG-0127',
      guardianName: 'Cali Xasan',
      guardianPhone: '+251 915 333 513',
      enrolledAt: '2026-09-12',
      status: 'ACTIVE',
      leftOn: null,
    });
    expect(
      pupilOf(
        pupil({ schoolStatus: 'INACTIVE', schoolStatusOn: '2026-09-20' }),
      ),
    ).toMatchObject({ status: 'INACTIVE', leftOn: '2026-09-20' });
    expect(pupilOf({ ...pupil(), status: 'DISCARDED' })).toMatchObject({
      status: 'WITHDRAWN',
    });
  });

  it('mirrors studentFolioMoney: a paid folio has paid its total, a partial reads the instalment, credit is paid beyond the bill', () => {
    expect(folioMoney(pupil())).toEqual({
      total: 2500,
      paidTotal: 0,
      outstanding: 2500,
      credit: 0,
    });
    expect(folioMoney(pupil({ paid: true }))).toEqual({
      total: 2500,
      paidTotal: 2500,
      outstanding: 0,
      credit: 0,
    });
    expect(folioMoney(pupil({}, { partialPaidAmount: 1000 }))).toEqual({
      total: 2500,
      paidTotal: 1000,
      outstanding: 1500,
      credit: 0,
    });
    expect(
      folioMoney({ ...pupil({}, { partialPaidAmount: 2500 }), total: 0 }),
    ).toEqual({ total: 0, paidTotal: 2500, outstanding: 0, credit: 2500 });
  });

  it('counts a SCHOOL record with a name as a pupil, and not an application, a voided row or a shop cart', () => {
    expect(isPupilRecord(pupil())).toBe(true);
    expect(isPupilRecord(pupil({ paid: 'voided' }))).toBe(false);
    expect(isPupilRecord(pupil({ hotelGuestName: '' }))).toBe(false);
    expect(isPupilRecord(pupil({ serviceFormat: 'QSR' }))).toBe(false);
    expect(
      isPupilRecord(pupil({}, { consumerSource: 'SUUQS', orderMode: 'QUOTE' })),
    ).toBe(false);
    // An accepted application that became a pupil is no longer QUOTE-mode.
    expect(
      isPupilRecord(pupil({}, { consumerSource: 'SUUQS', orderMode: 'ORDER' })),
    ).toBe(true);
  });

  it('hands the family the record minus who at the office did what', () => {
    const view = guardianFolioView(
      pupil({}, { partialPaidAmount: 500, registerSessionId: 9 }),
    );
    expect(view.cartSnapshot).not.toHaveProperty('schoolStatusBy');
    expect(view.cartSnapshot).not.toHaveProperty('schoolStatusHistory');
    for (const k of [
      'settledBy',
      'settledByName',
      'paidBy',
      'openedByName',
      'lastSettledByUserId',
    ])
      expect(view.cartSnapshot).not.toHaveProperty(k);
    expect(view.cartSnapshot.hotelGuestName).toBe('Faadumo Cali');
    expect(view.cartSnapshot.schoolLeavingBills).toEqual([
      { on: '2026-09-27', waived: 500 },
    ]);
    expect(view.cartSnapshot.schoolClassHistory).toEqual([
      { from: '2aad', to: '3aad' },
    ]);
    expect(view.metadata).toEqual({
      partialPaidAmount: 500,
      paidReceiptNumber: null,
    });
    expect(view.total).toBe(2500);
  });

  it('hands the family a receipt without the cashier', () => {
    const view = guardianReceiptView({
      id: 5,
      receiptNumber: 'POS-128-1',
      transactionType: 'SALE',
      status: 'PROCESSED',
      currency: 'ETB',
      total: 500,
      paidAmount: 500,
      changeDue: 0,
      occurredAt: '2026-09-20T09:00:00.000Z',
      cashierUserId: 77,
      cashierName: 'Hibo',
      tenders: [{ method: 'CASH', amount: 500, reference: 'x' }],
      items: [
        {
          title: 'Registration',
          quantity: 1,
          unitPrice: 500,
          lineTotal: 500,
          metadata: { schoolClass: '3aad', internal: 1 },
        },
      ],
      metadata: {
        folioId: 10422,
        registerId: 'r1',
        returnContext: { sourceReceiptNumber: 'POS-0', refundMethod: 'CASH' },
      },
    });
    expect(view).not.toHaveProperty('cashierName');
    expect(view.tenders).toEqual([{ method: 'CASH', amount: 500 }]);
    expect(view.items[0].metadata).toEqual({ schoolClass: '3aad' });
    expect(view.metadata).toEqual({
      folioId: 10422,
      backendFolioId: null,
      roomNumber: null,
      guestName: null,
      returnContext: { sourceReceiptNumber: 'POS-0' },
    });
    expect(view.sourceReceiptNumber).toBe('POS-0');
  });
});

describe('notices', () => {
  it('reach everyone when ALL, and a family with a child in a named class when CLASSES', () => {
    expect(noticeReaches({ audience: 'ALL' }, [])).toBe(true);
    expect(
      noticeReaches({ audience: 'CLASSES', classCodes: ['4aad'] }, [
        '3aad',
        '4AAD',
      ]),
    ).toBe(true);
    expect(
      noticeReaches({ audience: 'CLASSES', classCodes: ['4aad'] }, ['3aad']),
    ).toBe(false);
    expect(
      noticeReaches({ audience: 'CLASSES', classCodes: [] }, ['3aad']),
    ).toBe(false);
  });
  it('are live while active and not past their last day', () => {
    expect(
      noticeIsLive({ isActive: true, expiresAt: null }, '2026-09-27'),
    ).toBe(true);
    expect(
      noticeIsLive({ isActive: true, expiresAt: '2026-09-27' }, '2026-09-27'),
    ).toBe(true);
    expect(
      noticeIsLive({ isActive: true, expiresAt: '2026-09-26' }, '2026-09-27'),
    ).toBe(false);
    expect(
      noticeIsLive({ isActive: false, expiresAt: null }, '2026-09-27'),
    ).toBe(false);
  });
});

describe('class position — rankClassByTerm (a port of the office’s result sheet)', () => {
  const withMarks = (
    id: number,
    term: string,
    subjects: Array<[string, number | null, number?]>,
    position = '',
  ) => ({
    id,
    cartSnapshot: {
      schoolAcademicRecord: {
        reports: [
          {
            term,
            position,
            subjects: subjects.map(([subject, total, outOf]) => ({
              subject,
              total,
              outOf: outOf ?? 100,
              assessments: [],
            })),
          },
        ],
      },
    },
  });

  it('ranks complete pupils first by percent with shared places, and incomplete ones after them', () => {
    const rows = [
      withMarks(1, '2019-S1', [
        ['Maths', 80],
        ['English', 80],
        ['Somali', 80],
      ]), // 80, complete
      withMarks(2, '2019-S1', [
        ['Maths', 90],
        ['English', 88],
        ['Somali', 86],
        ['Science', 40],
      ]), // 76, complete (4 subjects)
      withMarks(3, '2019-S1', [
        ['Maths', 45, 50],
        ['English', 90],
        ['Somali', 90],
        ['Science', 90],
      ]), // 90, complete
      withMarks(4, '2019-S1', [
        ['Maths', 90],
        ['English', 88],
        ['Somali', 86],
        ['Science', 40],
      ]), // 76 tie
      withMarks(5, '2019-S1', [
        ['Maths', null],
        ['English', null],
      ]), // nothing marked
      withMarks(6, '2019-S2', [['Maths', 100]]), // another term
    ];
    const ranks = rankClassByTerm(rows, '2019-S1');
    expect(ranks.get(3)).toMatchObject({
      position: 1,
      of: 4,
      percent: 90,
      complete: true,
      subjectsMarked: 4,
      subjectsInClass: 4,
    });
    expect(ranks.get(2)).toMatchObject({ position: 2, complete: true });
    expect(ranks.get(4)).toMatchObject({ position: 2, complete: true });
    // Three subjects of four: incomplete, ranked after the complete three even at 80%.
    expect(ranks.get(1)).toMatchObject({
      position: 4,
      complete: false,
      subjectsMarked: 3,
      subjectsInClass: 4,
    });
    expect(ranks.has(5)).toBe(false);
    expect(ranks.has(6)).toBe(false);
    expect(readReports(rows[0])[0]).toMatchObject({
      term: '2019-S1',
      position: '',
    });
    expect(reportPercent(readReports(rows[2])[0])).toBe(90);
  });

  it('reads today in the school’s zone', () => {
    const late = new Date('2026-09-28T21:30:00Z'); // 00:30 next day in Addis Ababa
    expect(localDayIn('Africa/Addis_Ababa', late)).toBe('2026-09-29');
    expect(localDayIn('UTC', late)).toBe('2026-09-28');
    expect(localDayIn('Not/AZone', late)).toBe('2026-09-28');
    expect(schoolTimeZone({ timezone: null, country: 'ET' })).toBe(
      'Africa/Addis_Ababa',
    );
    expect(schoolTimeZone({ timezone: 'Africa/Nairobi', country: 'ET' })).toBe(
      'Africa/Nairobi',
    );
    expect(schoolTimeZone({ timezone: '', country: 'KE' })).toBe('UTC');
  });
});
