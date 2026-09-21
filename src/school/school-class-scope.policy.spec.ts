import {
  assignedClassCodes,
  classInScope,
  classScopeRefusal,
  isClassScoped,
  pupilClassRefusal,
  pupilsOutsideClass,
} from './school-class-scope.policy';

/* "Teachers should only manage assigned grade only." */
describe('school-class-scope.policy', () => {
  it('leaves the owner, a manager, a global admin and the office unscoped', () => {
    expect(
      isClassScoped({ actorId: 1863, ownerId: 1863, assignment: null }),
    ).toBe(false);
    expect(
      isClassScoped({
        actorId: 5,
        ownerId: 1863,
        assignment: { role: 'MANAGER', isActive: true, permissions: [] },
      }),
    ).toBe(false);
    expect(
      isClassScoped({
        actorId: 5,
        ownerId: 1863,
        roles: ['SUPER_ADMIN'],
        assignment: null,
      }),
    ).toBe(false);
    expect(
      isClassScoped({
        actorId: 5,
        ownerId: 1863,
        assignment: {
          role: 'OPERATOR',
          isActive: true,
          permissions: ['VIEW_CLASS_BOARD', 'ENROL_STUDENT'],
        },
      }),
    ).toBe(false);
  });

  it('scopes the Teacher lane whatever else was ticked on it — the lane is the office’s own word', () => {
    expect(
      isClassScoped({
        actorId: 5,
        ownerId: 1863,
        assignment: {
          role: 'OPERATOR',
          isActive: true,
          permissions: ['ENROL_STUDENT'],
          posExperienceProfileCode: 'SCHOOL_TEACHER',
        },
      }),
    ).toBe(true);
    expect(
      isClassScoped({
        actorId: 5,
        ownerId: 1863,
        roles: ['POS_MANAGER'],
        assignment: {
          role: 'MANAGER',
          isActive: true,
          permissions: [],
          posExperienceProfileCode: 'school_teacher',
        },
      }),
    ).toBe(true);
    // The owner is never a teacher, even on that lane.
    expect(
      isClassScoped({
        actorId: 1863,
        ownerId: 1863,
        assignment: {
          role: 'OPERATOR',
          isActive: true,
          permissions: [],
          posExperienceProfileCode: 'SCHOOL_TEACHER',
        },
      }),
    ).toBe(false);
  });

  it('scopes a teacher — an operator without the office permission — and anyone with no live assignment', () => {
    expect(
      isClassScoped({
        actorId: 5,
        ownerId: 1863,
        assignment: {
          role: 'OPERATOR',
          isActive: true,
          permissions: ['VIEW_CLASS_BOARD', 'MARK_ATTENDANCE'],
        },
      }),
    ).toBe(true);
    expect(
      isClassScoped({
        actorId: 5,
        ownerId: 1863,
        assignment: {
          role: 'OPERATOR',
          isActive: false,
          permissions: ['ENROL_STUDENT'],
        },
      }),
    ).toBe(true);
    expect(isClassScoped({ actorId: 5, ownerId: 1863, assignment: null })).toBe(
      true,
    );
    expect(
      isClassScoped({ actorId: null, ownerId: 1863, assignment: null }),
    ).toBe(true);
  });

  it('unions the home room and the SCHOOL_CLASS capabilities, lowercased — the timetable assigns nothing', () => {
    const codes = assignedClassCodes({
      homeroomCodes: ['3aad', '', null],
      capabilities: ['SCHOOL_CLASS:7th', 'ENTER_MARKS', 'school_class:8th'],
    });
    expect([...codes].sort()).toEqual(['3aad', '7th', '8th']);
    expect(assignedClassCodes({}).size).toBe(0);
  });

  it('answers in-scope for an unscoped person, and by class for a scoped one, and names the refusal', () => {
    const office = { scoped: false, codes: null, recordedBy: 'Office' };
    expect(classInScope(office, 'anything')).toBe(true);
    const teacher = {
      scoped: true,
      codes: new Set(['3aad', '7th']),
      recordedBy: 'Mustafe',
    };
    expect(classInScope(teacher, '3AAD')).toBe(true);
    expect(classInScope(teacher, '4aad')).toBe(false);
    expect(classScopeRefusal(teacher, '4aad')).toBe(
      '4aad is not one of your classes (3aad, 7th). Ask the office to take its register.',
    );
    expect(
      classScopeRefusal(
        { scoped: true, codes: new Set(), recordedBy: 'X' },
        '4aad',
      ),
    ).toMatch(/No class is assigned to you yet/);
  });

  it('names the pupils whose folio sits in another class, and lets unknown or class-less folios pass', () => {
    const carts = [
      {
        id: 1,
        cartSnapshot: { hotelRoomNumber: '3aad', hotelGuestName: 'Amina' },
      },
      {
        id: 2,
        cartSnapshot: { hotelRoomNumber: '4AAD', hotelGuestName: 'Bilan' },
      },
      { id: 3, cartSnapshot: { hotelRoomNumber: '', hotelGuestName: 'Cali' } },
      { id: 4, cartSnapshot: null },
      { id: 5, cartSnapshot: { hotelRoomNumber: '5aad' } },
    ];
    expect(pupilsOutsideClass(carts, '3AAD')).toEqual([
      { id: '2', name: 'Bilan', classCode: '4AAD' },
      { id: '5', name: 'folio 5', classCode: '5aad' },
    ]);
    expect(pupilsOutsideClass(carts, '')).toEqual([]);
    expect(
      pupilClassRefusal('3aad', [{ name: 'Bilan', classCode: '4aad' }]),
    ).toBe('Bilan (4aad) is not in 3aad — this register cannot carry them.');
    expect(
      pupilClassRefusal('3aad', [
        { name: 'A', classCode: '4aad' },
        { name: 'B', classCode: '4aad' },
        { name: 'C', classCode: '4aad' },
        { name: 'D', classCode: '4aad' },
        { name: 'E', classCode: '4aad' },
      ]),
    ).toBe(
      'A (4aad), B (4aad), C (4aad) and 2 more are not in 3aad — this register cannot carry them.',
    );
  });
});
