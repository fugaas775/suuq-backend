import { SchoolDefaultLoginsService } from './school-default-logins.service';

/* Every pupil gets SMAQ's logins by default: a student's (Grade 6+) and a
   parent's (one per phone), password 12345678 — and never a second time. */

const pupil = (
  id: number,
  over: Record<string, unknown> = {},
  status = 'SUSPENDED',
) => ({
  id,
  branchId: 150,
  status,
  metadata: {},
  cartSnapshot: {
    serviceFormat: 'SCHOOL',
    hotelGuestName: `Pupil ${id}`,
    hotelRoomNumber: '7A',
    schoolAdmissionNo: `FGA-${id}`,
    schoolGuardianName: 'Cali Xasan',
    hotelGuestPhone: '0915333513',
    ...over,
  },
});

function makeService({
  records = [] as any[],
  marks = [] as any[],
  accounts = [] as any[],
  guardianRows = [] as any[],
  links = [] as any[],
  users = [] as any[],
} = {}) {
  const marksRepo = {
    find: jest.fn(async ({ where }) =>
      marks.filter(
        (m) => m.branchId === where.branchId && m.kind === where.kind,
      ),
    ),
    createQueryBuilder: () => {
      let rows: any[] = [];
      const chain: any = {
        insert: () => chain,
        values: (v: any[]) => ((rows = v), chain),
        orIgnore: () => chain,
        execute: async () => {
          for (const r of rows) {
            if (
              !marks.some(
                (m) =>
                  m.branchId === r.branchId &&
                  m.folioId === r.folioId &&
                  m.kind === r.kind,
              )
            )
              marks.push(r);
          }
        },
      };
      return chain;
    },
  };
  const guardians = {
    pupilRecords: jest.fn(async () => records),
    create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
  };
  const students = {
    createMany: jest.fn(async (dto: { folioIds: number[] }) => ({
      created: dto.folioIds.map((folioId) => ({ folioId })),
      skipped: [],
      createdCount: dto.folioIds.length,
    })),
  };
  const service = new SchoolDefaultLoginsService(
    {} as any,
    marksRepo as any,
    { find: jest.fn(async () => accounts) } as any,
    {
      find: jest.fn(async () => guardianRows),
      findOne: jest.fn(
        async ({ where }) =>
          guardianRows.find(
            (g) => g.branchId === where.branchId && g.userId === where.userId,
          ) ?? null,
      ),
    } as any,
    {
      find: jest.fn(async ({ where }) =>
        links.filter((l) =>
          where.guardianId?._value
            ? where.guardianId._value.includes(l.guardianId)
            : l.guardianId === where.guardianId,
        ),
      ),
    } as any,
    {
      findOne: jest.fn(
        async ({ where }) =>
          users.find((u) => u.posUsername === where.posUsername) ?? null,
      ),
    } as any,
    guardians as any,
    students as any,
  );
  return { service, guardians, students, marks };
}

describe('SchoolDefaultLoginsService', () => {
  it('makes the student logins and ONE parent login per phone, password 12345678', async () => {
    const { service, guardians, students } = makeService({
      records: [
        pupil(1),
        pupil(2),
        pupil(3, { hotelGuestPhone: '+251 911 000 111' }),
        pupil(4, { hotelGuestPhone: '' }),
      ],
    });
    const result = await service.ensureForBranch(150);
    expect(students.createMany).toHaveBeenCalledWith(
      { branchId: 150, folioIds: [1, 2, 3, 4], password: '12345678' },
      {},
    );
    expect(guardians.create).toHaveBeenCalledTimes(2);
    expect(guardians.create).toHaveBeenCalledWith(
      {
        branchId: 150,
        phone: '0915333513',
        displayName: 'Cali Xasan',
        password: '12345678',
        folioIds: [1, 2],
      },
      {},
    );
    expect(result).toMatchObject({ studentsCreated: 4, familiesCreated: 2 });
  });

  it('never hands back a login the office removed (a marked record is skipped)', async () => {
    const { service, guardians, students } = makeService({
      records: [pupil(1)],
      marks: [
        { branchId: 150, folioId: 1, kind: 'STUDENT' },
        { branchId: 150, folioId: 1, kind: 'PARENT' },
      ],
    });
    await service.ensureForBranch(150);
    expect(students.createMany).not.toHaveBeenCalled();
    expect(guardians.create).not.toHaveBeenCalled();
  });

  it('leaves a pupil who left alone', async () => {
    const { service, guardians, students } = makeService({
      records: [pupil(1, { schoolStatus: 'INACTIVE' })],
    });
    await service.ensureForBranch(150);
    expect(students.createMany).not.toHaveBeenCalled();
    expect(guardians.create).not.toHaveBeenCalled();
  });

  it("ticks a new sibling onto the family's existing login at this school", async () => {
    const { service, guardians } = makeService({
      records: [pupil(1), pupil(2)],
      users: [{ id: 900, posUsername: '0915333513' }],
      guardianRows: [{ id: 33, branchId: 150, userId: 900 }],
      links: [{ guardianId: 33, folioId: 1 }],
    });
    const result = await service.ensureForBranch(150);
    expect(guardians.create).not.toHaveBeenCalled();
    expect(guardians.update).toHaveBeenCalledWith(33, {
      branchId: 150,
      folioIds: [1, 2],
    });
    expect(result.childrenLinked).toBe(1);
  });

  it('leaves a phone that signs in as something else to the office', async () => {
    const { service, guardians, marks } = makeService({
      records: [pupil(1)],
      users: [{ id: 5, posUsername: '0915333513' }],
    });
    await service.ensureForBranch(150);
    expect(guardians.create).not.toHaveBeenCalled();
    expect(guardians.update).not.toHaveBeenCalled();
    expect(marks.some((m) => m.kind === 'PARENT')).toBe(false);
  });
});
