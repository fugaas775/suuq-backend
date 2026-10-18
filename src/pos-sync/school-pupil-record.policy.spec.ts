import {
  canEditPupilRecord,
  keepStoredPupilRecord,
  pupilRecordDelta,
  pupilRecordRefusal,
} from './school-pupil-record.policy';

const changedPupilFields = (a: any, b: any) => pupilRecordDelta(a, b).changed;

/** A pupil's own record vs the fee work that travels in the same PATCH. */
describe('school-pupil-record.policy', () => {
  const stored = {
    serviceFormat: 'SCHOOL',
    hotelGuestName: 'Amina Cali',
    hotelRoomNumber: '3aad',
    schoolAdmissionNo: 'SMAG-0127',
    hotelGuestPhone: '0915333513',
    hotelCheckInAt: '2026-09-11',
    hotelCheckOutAt: '2026-10-10',
    schoolBillingCycle: 'ETHIOPIAN_MONTH',
    schoolScholarshipRate: 0.5,
    cartLines: [
      { name: 'Tuition', total: 1500 },
      {
        name: '50% scholarship',
        total: -750,
        metadata: { schoolScholarship: true },
      },
    ],
  };

  it('sees no change in fee work: lines, waiver total, paid-through, paid markers', () => {
    expect(
      changedPupilFields(stored, {
        ...stored,
        hotelCheckOutAt: '2026-11-09',
        paid: true,
        cartLines: [
          { name: 'Tuition', total: 1500 },
          { name: 'Tuition — Tikimt', total: 1500 },
          {
            name: '50% scholarship',
            total: -1500,
            metadata: { schoolScholarship: true, scholarshipRate: 0.5 },
          },
        ],
      }),
    ).toEqual([]);
  });

  it('forgives what a round trip does to a value: whitespace, an ISO date, a cadence’s case, null vs blank', () => {
    expect(
      changedPupilFields(
        { ...stored, schoolGuardianName: '' },
        {
          ...stored,
          hotelGuestName: ' Amina  Cali ',
          hotelCheckInAt: '2026-09-11T00:00:00.000Z',
          schoolBillingCycle: 'ethiopian_month',
          schoolGuardianName: null,
        },
      ),
    ).toEqual([]);
  });

  it('names every pupil field that moved', () => {
    expect(
      changedPupilFields(stored, {
        ...stored,
        hotelGuestName: 'Amina Xasan',
        hotelRoomNumber: '4aad',
        hotelGuestPhone: '0911000000',
        schoolScholarshipRate: 1,
      }),
    ).toEqual([
      'hotelGuestName',
      'hotelRoomNumber',
      'hotelGuestPhone',
      'schoolScholarshipRate',
    ]);
  });

  it('counts a scholarship granted or revoked, by rate or by waiver line', () => {
    const plain = {
      ...stored,
      schoolScholarshipRate: undefined,
      cartLines: [{ name: 'Tuition', total: 1500 }],
    };
    expect(
      changedPupilFields(plain, {
        ...plain,
        cartLines: [
          ...plain.cartLines,
          { total: -1500, metadata: { schoolScholarship: true } },
        ],
      }),
    ).toEqual(['scholarship']);
    expect(
      changedPupilFields(stored, {
        ...stored,
        schoolScholarshipRate: 0,
        cartLines: [{ name: 'Tuition', total: 1500 }],
      }),
    ).toEqual(['schoolScholarshipRate', 'scholarship']);
  });

  it('lets a pupil whose rate is on file get their first waiver line with their first charge', () => {
    const noLineYet = { ...stored, cartLines: [] };
    expect(changedPupilFields(noLineYet, stored)).toEqual([]);
  });

  it('tells a blank filled in and a field left out apart from a change — and keeps the stored value for both', () => {
    const { schoolAdmissionNo, ...withoutNumber } = stored;
    const delta = pupilRecordDelta(
      { ...stored, schoolGuardianName: '' },
      { ...withoutNumber, schoolGuardianName: 'Cali Xasan' },
    );
    expect(delta).toEqual({
      changed: [],
      filled: ['schoolGuardianName'],
      dropped: ['schoolAdmissionNo'],
    });
    const kept = keepStoredPupilRecord(
      { ...stored, schoolGuardianName: '' },
      { ...withoutNumber, schoolGuardianName: 'Cali Xasan' },
      [...delta.filled, ...delta.dropped],
    );
    expect(kept.schoolAdmissionNo).toBe(schoolAdmissionNo);
    expect(kept.schoolGuardianName).toBe('');
  });

  it('sees nothing at all in a plain fee save', () => {
    expect(
      pupilRecordDelta(stored, {
        ...stored,
        paid: true,
        hotelCheckOutAt: '2026-11-09',
      }),
    ).toEqual({ changed: [], filled: [], dropped: [] });
  });

  it('lets the owner, a platform admin, a manager and the office edit — not the cashier or a teacher', () => {
    const op = (permissions: string[]) => ({
      isActive: true,
      role: 'OPERATOR',
      permissions,
    });
    expect(
      canEditPupilRecord({ actorId: 7, ownerId: 7, assignment: null }),
    ).toBe(true);
    expect(
      canEditPupilRecord({ actorId: 9, ownerId: 7, roles: ['SUPER_ADMIN'] }),
    ).toBe(true);
    expect(
      canEditPupilRecord({
        actorId: 9,
        ownerId: 7,
        assignment: { isActive: true, role: 'MANAGER', permissions: [] },
      }),
    ).toBe(true);
    expect(
      canEditPupilRecord({
        actorId: 9,
        ownerId: 7,
        assignment: op(['ENROL_STUDENT']),
      }),
    ).toBe(true);
    expect(
      canEditPupilRecord({
        actorId: 9,
        ownerId: 7,
        assignment: op(['POST_FEE_CHARGE', 'MANAGE_SCHOOL_LOGINS']),
      }),
    ).toBe(false);
    expect(
      canEditPupilRecord({
        actorId: 9,
        ownerId: 7,
        assignment: op(['VIEW_CLASS_BOARD', 'MARK_ATTENDANCE']),
      }),
    ).toBe(false);
    expect(
      canEditPupilRecord({
        actorId: 9,
        ownerId: 7,
        assignment: { ...op(['ENROL_STUDENT']), isActive: false },
      }),
    ).toBe(false);
    expect(canEditPupilRecord({ actorId: null, ownerId: 7 })).toBe(false);
  });

  it('refuses in the school’s words', () => {
    expect(
      pupilRecordRefusal([
        'hotelGuestName',
        'schoolScholarshipRate',
        'scholarship',
      ]),
    ).toBe(
      "Only the school office can change a student's details (name, scholarship). Fees can still be charged and taken.",
    );
  });
});
