import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SchoolClassService } from './school-class.service';
import { SchoolClass, SchoolClassStatus } from './entities/school-class.entity';
import { SchoolTimetable } from './entities/school-timetable.entity';
import { SchoolTextbookTitle } from './entities/school-textbook-title.entity';
import { SchoolTextbookLoan } from './entities/school-textbook-loan.entity';
import { SchoolLessonPlan } from './entities/school-lesson-plan.entity';
import { LessonAttendanceMark } from '../attendance/entities/lesson-attendance-mark.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';

/**
 * The registry's rules, which exist because the product-attribute model it
 * replaces could not enforce any of them.
 */

const stamp = new Date('2026-08-15T08:00:00.000Z');

function makeService({
  existingByCode = null,
  rows = [],
  enrolled = 0,
  // The registry answers three different single-row questions now — "is this
  // code taken?", "how does this branch spell this grade?" and "is this section
  // taken?" — so one blanket getOne can no longer stand in for all of them.
  // Each builder remembers its own conditions and the reply is chosen from
  // them, which keeps every test that only cares about codes arranging nothing.
  gradeSibling = null,
  sectionClash = null,
  sortOrderTaken = 0,
  // The staff rows this branch has, for the home room teacher checks.
  employees = [],
  // What the "which classes am I home room teacher of" query answers.
  homeroomRows = null,
  // What a rename finds to carry across: the timetable document, the staff
  // assignments, and how many rows each class-keyed table reports moved.
  timetable = null as any,
  staff = [] as any[],
  movedRows = {} as Record<string, number>,
}: any = {}) {
  const saved: any[] = [];
  const deleted: any[] = [];
  // Everything the rename transaction wrote beyond the class row itself.
  const rekey: any = {
    timetableSaved: null as any,
    staffUpdates: [] as any[],
    updates: [] as Array<{ table: any; set: any; where: any[] }>,
    committed: false,
  };

  const makeQb = () => {
    const conds: string[] = [];
    const qb: any = {
      where: (c: string) => {
        conds.push(String(c));
        return qb;
      },
      andWhere: (c: string) => {
        conds.push(String(c));
        return qb;
      },
      select: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      take: () => qb,
      getOne: async () => {
        const sql = conds.join(' ');
        if (sql.includes('"section"')) return sectionClash;
        if (sql.includes('"gradeCode"')) return gradeSibling;
        return existingByCode;
      },
      getMany: async () =>
        conds.join(' ').includes('"homeroomEmployeeId"')
          ? (homeroomRows ?? [])
          : rows,
      getCount: async () =>
        conds.join(' ').includes('"sortOrder"') ? sortOrderTaken : enrolled,
      getRawOne: async () => ({ max: rows.length ? 20 : null }),
    };
    return qb;
  };

  const repo: any = {
    createQueryBuilder: () => makeQb(),
    findOne: async ({ where }: any) =>
      rows.find(
        (r: any) =>
          Number(r.id) === Number(where.id) && r.branchId === where.branchId,
      ) ?? null,
    create: (value: any) => ({ ...value }),
    save: async (value: any) => {
      const list = Array.isArray(value) ? value : [value];
      for (const v of list) {
        saved.push(v);
        v.id = v.id ?? 77;
        v.createdAt = v.createdAt ?? stamp;
        v.updatedAt = stamp;
      }
      return value;
    },
    delete: async (criteria: any) => {
      deleted.push(criteria);
      return { affected: 1 };
    },
  };

  const cartRepo: any = { createQueryBuilder: () => makeQb() };
  const employeeRepo: any = {
    findOne: async ({ where }: any) =>
      employees.find(
        (e: any) =>
          Number(e.id) === Number(where.id) &&
          Number(e.branchId) === Number(where.branchId),
      ) ?? null,
    find: async ({ where }: any) =>
      employees.filter(
        (e: any) =>
          Number(e.branchId) === Number(where.branchId) &&
          Number(e.userId) === Number(where.userId),
      ),
  };
  const em: any = {
    getRepository: (entity: any) => {
      if (entity === SchoolClass) return repo;
      if (entity === SchoolTimetable)
        return {
          findOne: async () => timetable,
          save: async (doc: any) => {
            rekey.timetableSaved = doc;
            return doc;
          },
        };
      if (entity === BranchStaffAssignment)
        return {
          find: async () => staff,
          update: async (criteria: any, partial: any) => {
            rekey.staffUpdates.push({ ...criteria, ...partial });
            return { affected: 1 };
          },
        };
      throw new Error(`unexpected repository ${entity?.name}`);
    },
    createQueryBuilder: () => {
      const op: any = { where: [] };
      const qb: any = {
        update: (table: any) => {
          op.table = table;
          return qb;
        },
        set: (v: any) => {
          op.set = v;
          return qb;
        },
        where: (sql: string, params: any) => {
          op.where.push([sql, params]);
          return qb;
        },
        andWhere: (sql: string, params: any) => {
          op.where.push([sql, params]);
          return qb;
        },
        execute: async () => {
          rekey.updates.push(op);
          return { affected: movedRows[op.table?.name] ?? 0 };
        },
      };
      return qb;
    },
  };
  repo.manager = {
    transaction: async (fn: any) => {
      const out = await fn(em);
      rekey.committed = true;
      return out;
    },
  };
  return {
    service: new SchoolClassService(repo, cartRepo, employeeRepo),
    saved,
    deleted,
    rekey,
  };
}

const row = (over: any = {}) => ({
  id: 1,
  branchId: 115,
  code: '3a',
  name: null,
  gradeCode: null,
  section: null,
  sortOrder: 10,
  feeProductId: null,
  capacity: null,
  homeroomEmployeeId: null,
  homeroomTeacherName: null,
  status: SchoolClassStatus.ACTIVE,
  metadata: null,
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});

describe('SchoolClassService — a class code is one thing per branch', () => {
  it('refuses a code that already exists in another case', async () => {
    // Every reader keys on the lowercased code — the folio's class, the tuition
    // line's tag, the roster importer's dedupe. "3A" beside "3a" would be two
    // classes on the board and one set of children.
    const { service } = makeService({ existingByCode: row({ code: '3a' }) });
    await expect(
      service.create({ branchId: 115, code: '3A' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('names the existing class as the school spelled it, not as the caller did', async () => {
    const { service } = makeService({ existingByCode: row({ code: '3a' }) });
    await expect(
      service.create({ branchId: 115, code: '3A' } as any),
    ).rejects.toThrow(/"3a" already exists/);
  });

  it('appends a new class to the end rather than piling every one at zero', async () => {
    const { service, saved } = makeService({ rows: [row()] });
    await service.create({ branchId: 115, code: '4aad' });
    expect(saved[0].sortOrder).toBe(30);
  });

  it('honours an explicit position when one is given', async () => {
    const { service, saved } = makeService({ rows: [row()] });
    await service.create({ branchId: 115, code: '4aad', sortOrder: 5 });
    expect(saved[0].sortOrder).toBe(5);
  });
});

describe('SchoolClassService — renaming', () => {
  it('refuses a rename onto a code another class already holds', async () => {
    const { service } = makeService({
      rows: [row({ id: 1, code: '3a' })],
      existingByCode: row({ id: 2, code: '4aad' }),
    });
    await expect(
      service.update(1, { branchId: 115, code: '4aad' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a class to be re-cased to itself', async () => {
    // "3a" → "3A" is the school fixing its own spelling, not a collision.
    const target = row({ id: 1, code: '3a' });
    const { service, saved } = makeService({
      rows: [target],
      existingByCode: target,
    });
    const result = await service.update(1, {
      branchId: 115,
      code: '3A',
    });
    expect(result.code).toBe('3A');
    expect(saved).toHaveLength(1);
  });

  it('will not touch a class belonging to another branch', async () => {
    const { service } = makeService({ rows: [row({ branchId: 115 })] });
    await expect(
      service.update(1, { branchId: 999, code: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears the fee link when explicitly given null', async () => {
    // A class can be un-priced again — that is what happens when the fee product
    // it named is retired.
    const { service } = makeService({ rows: [row({ feeProductId: 3245 })] });
    const result = await service.update(1, {
      branchId: 115,
      feeProductId: null,
    });
    expect(result.feeProductId).toBeNull();
  });

  it('leaves the fee link alone when the field is absent', async () => {
    const { service } = makeService({ rows: [row({ feeProductId: 3245 })] });
    const result = await service.update(1, {
      branchId: 115,
      capacity: 40,
    });
    expect(result.feeProductId).toBe(3245);
    expect(result.capacity).toBe(40);
  });
});

describe('SchoolClassService — removing a class', () => {
  it('refuses while children are still in it, and says how many', async () => {
    const { service, deleted } = makeService({
      rows: [row({ code: '3b' })],
      enrolled: 3,
    });
    await expect(service.remove(1, 115)).rejects.toThrow(
      /3 students are enrolled in "3b"/,
    );
    expect(deleted).toHaveLength(0);
  });

  it('reads as one student in the singular', async () => {
    const { service } = makeService({ rows: [row()], enrolled: 1 });
    await expect(service.remove(1, 115)).rejects.toThrow(
      /1 student is enrolled/,
    );
  });

  it('offers INACTIVE as the alternative, because it keeps their records', async () => {
    const { service } = makeService({ rows: [row()], enrolled: 2 });
    await expect(service.remove(1, 115)).rejects.toThrow(
      /set the class inactive/,
    );
  });

  it('deletes an empty class — the only case, a typo being undone', async () => {
    const { service, deleted } = makeService({ rows: [row()], enrolled: 0 });
    await expect(service.remove(1, 115)).resolves.toEqual({
      deleted: true,
      id: 1,
      code: '3a',
    });
    expect(deleted).toHaveLength(1);
  });
});

describe('SchoolClassService — sections of a grade', () => {
  it('refuses a section that names no grade — it could not be grouped', async () => {
    // A stray 'A' has no card to sit under on the board and rolls up to nothing
    // in the fee report, so it is refused at the write rather than rendered.
    const { service } = makeService();
    await expect(
      service.create({ branchId: 115, code: '3aad A', section: 'A' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('files a section under the grade, and beside its siblings in teaching order', async () => {
    // 20 is the last sortOrder in the grade; the next section takes 21, inside
    // the gap the ten-spacing leaves, so the next GRADE still starts at 30.
    const { service, saved } = makeService({
      rows: [
        row({ code: '3aad A', gradeCode: '3aad', section: 'A', sortOrder: 20 }),
      ],
      gradeSibling: row({
        code: '3aad A',
        gradeCode: '3aad',
        section: 'A',
        sortOrder: 20,
      }),
    });
    await service.create({
      branchId: 115,
      code: '3aad B',
      gradeCode: '3aad',
      section: 'B',
    });
    expect(saved[0]).toMatchObject({
      code: '3aad B',
      gradeCode: '3aad',
      section: 'B',
      sortOrder: 21,
    });
  });

  it('spells the grade the way the school already spells it', async () => {
    // Sections are added one at a time, days apart, by whoever is at the desk.
    // 'grade 3' typed the second time must not open a second grade holding one
    // section, which is what the board and the fee roll would then show.
    const { service, saved } = makeService({
      gradeSibling: row({ code: '3aad A', gradeCode: 'Grade 3', section: 'A' }),
    });
    await service.create({
      branchId: 115,
      code: '3aad B',
      gradeCode: 'grade 3',
      section: 'B',
    });
    expect(saved[0].gradeCode).toBe('Grade 3');
  });

  it('refuses a second section A in one grade, and says which class already is it', async () => {
    const { service } = makeService({
      sectionClash: row({ code: '3aad A', gradeCode: '3aad', section: 'A' }),
    });
    await expect(
      service.create({
        branchId: 115,
        code: '3aad Alpha',
        gradeCode: '3aad',
        section: 'A',
      } as any),
    ).rejects.toThrow(/already exists — it is "3aad A"/);
  });

  it('leaves a class sectioned when a PATCH only re-points its fee', async () => {
    // The one way this shape can silently lose data: a fee edit that carries no
    // grade field must not read as "this class has no grade".
    const target = row({
      id: 4,
      code: '3aad A',
      gradeCode: '3aad',
      section: 'A',
    });
    const { service, saved } = makeService({ rows: [target] });
    await service.update(4, { branchId: 115, feeProductId: 3269 });
    expect(saved[0]).toMatchObject({ gradeCode: '3aad', section: 'A' });
  });

  it('un-sections a class when the grade is explicitly cleared', async () => {
    const target = row({
      id: 4,
      code: '3aad',
      gradeCode: '3aad',
      section: 'A',
    });
    const { service, saved } = makeService({ rows: [target] });
    await service.update(4, {
      branchId: 115,
      gradeCode: null,
      section: null,
    });
    expect(saved[0]).toMatchObject({ gradeCode: null, section: null });
  });

  it('lets a class keep its own section letter when it is re-saved', async () => {
    // The clash check must exempt the row being written, or a school could
    // never edit the section it already holds.
    const target = row({
      id: 4,
      code: '3aad A',
      gradeCode: '3aad',
      section: 'A',
    });
    const { service, saved } = makeService({
      rows: [target],
      sectionClash: target,
    });
    await service.update(4, {
      branchId: 115,
      gradeCode: '3aad',
      section: 'A',
    });
    expect(saved[0]).toMatchObject({ gradeCode: '3aad', section: 'A' });
  });
});

describe('SchoolClassService — reordering', () => {
  it('writes the new positions in one request', async () => {
    const a = row({ id: 1, sortOrder: 10 });
    const b = row({ id: 2, code: '3b', sortOrder: 20 });
    const { service, saved } = makeService({ rows: [a, b] });
    await service.reorder({
      branchId: 115,
      order: [
        { id: 2, sortOrder: 10 },
        { id: 1, sortOrder: 20 },
      ],
    });
    expect(saved.map((r: any) => [r.id, r.sortOrder])).toEqual([
      [2, 10],
      [1, 20],
    ]);
  });

  it('skips a stale id instead of failing the whole gesture', async () => {
    // Reordering is a drag. Rejecting it wholesale for one id that has since
    // been deleted would leave the list looking rearranged and stored unchanged.
    const a = row({ id: 1 });
    const { service, saved } = makeService({ rows: [a] });
    await service.reorder({
      branchId: 115,
      order: [
        { id: 1, sortOrder: 30 },
        { id: 404, sortOrder: 40 },
      ],
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].sortOrder).toBe(30);
  });
});

/**
 * The home room teacher — who answers for a class's daily register.
 *
 * Named on the class rather than derived from the timetable, because both live
 * schools are subject-taught from Grade 1 and the first period of a class is
 * held by three to five different people across the week. These tests pin the
 * two things that make the column trustworthy: the name always comes off the
 * staff row, and a PATCH about something else never disturbs the assignment.
 */
describe('SchoolClassService — the home room teacher', () => {
  const staff = [
    {
      id: 30,
      branchId: 115,
      fullName: 'Mustafe',
      jobTitle: 'Teacher',
      status: 'ACTIVE',
      userId: 900,
    },
    {
      id: 26,
      branchId: 115,
      fullName: 'Mustafe Maxamed Sheekh',
      jobTitle: 'Teacher',
      status: 'ACTIVE',
      userId: null,
    },
    // Same person, on another branch: naming them here must be refused.
    {
      id: 77,
      branchId: 128,
      fullName: 'Kaamil',
      jobTitle: 'Teacher',
      status: 'ACTIVE',
      userId: 901,
    },
  ];

  it('stores the name off the staff row, not from the client', async () => {
    const { service, saved } = makeService({
      rows: [row({ id: 1 })],
      employees: staff,
    });
    const out = await service.update(1, {
      branchId: 115,
      homeroomEmployeeId: 30,
      // A client may send whatever it likes here; the DTO has no such field and
      // the service must not read one.
      homeroomTeacherName: 'Somebody Else',
    } as any);
    expect(saved[0].homeroomEmployeeId).toBe(30);
    expect(saved[0].homeroomTeacherName).toBe('Mustafe');
    expect(out.homeroomTeacherName).toBe('Mustafe');
  });

  it('refuses a teacher who is not on this branch’s staff list', async () => {
    const { service } = makeService({
      rows: [row({ id: 1 })],
      employees: staff,
    });
    await expect(
      service.update(1, { branchId: 115, homeroomEmployeeId: 77 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an id nobody holds', async () => {
    const { service } = makeService({
      rows: [row({ id: 1 })],
      employees: staff,
    });
    await expect(
      service.update(1, { branchId: 115, homeroomEmployeeId: 4242 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears both columns on an explicit null', async () => {
    const { service, saved } = makeService({
      rows: [
        row({ id: 1, homeroomEmployeeId: 30, homeroomTeacherName: 'Mustafe' }),
      ],
      employees: staff,
    });
    await service.update(1, { branchId: 115, homeroomEmployeeId: null });
    expect(saved[0].homeroomEmployeeId).toBeNull();
    expect(saved[0].homeroomTeacherName).toBeNull();
  });

  it('leaves the assignment alone when the PATCH is about something else', async () => {
    // The rule `resolvePlacement` already follows, for the same reason: moving
    // a class's fee product must not un-assign the teacher who takes its
    // register.
    const { service, saved } = makeService({
      rows: [
        row({ id: 1, homeroomEmployeeId: 30, homeroomTeacherName: 'Mustafe' }),
      ],
      employees: staff,
    });
    await service.update(1, { branchId: 115, feeProductId: 321 });
    expect(saved[0].feeProductId).toBe(321);
    expect(saved[0].homeroomEmployeeId).toBe(30);
    expect(saved[0].homeroomTeacherName).toBe('Mustafe');
  });

  it('can be named as a class is created', async () => {
    const { service, saved } = makeService({ employees: staff });
    await service.create({
      branchId: 115,
      code: '3aad',
      homeroomEmployeeId: 26,
    });
    expect(saved[0].homeroomEmployeeId).toBe(26);
    expect(saved[0].homeroomTeacherName).toBe('Mustafe Maxamed Sheekh');
  });

  it('a new class names nobody by default', async () => {
    const { service, saved } = makeService({ employees: staff });
    await service.create({ branchId: 115, code: '4aad' });
    expect(saved[0].homeroomEmployeeId).toBeNull();
    expect(saved[0].homeroomTeacherName).toBeNull();
  });
});

describe('SchoolClassService.mine — a teacher’s own classes', () => {
  const staff = [
    {
      id: 30,
      branchId: 115,
      fullName: 'Mustafe',
      jobTitle: 'Teacher',
      status: 'ACTIVE',
      userId: 900,
    },
    {
      id: 31,
      branchId: 115,
      fullName: 'Old Row',
      jobTitle: 'Teacher',
      status: 'INACTIVE',
      userId: 901,
    },
    {
      id: 32,
      branchId: 115,
      fullName: 'Rehired',
      jobTitle: 'Teacher',
      status: 'ACTIVE',
      userId: 901,
    },
  ];

  it('answers the classes that name the caller', async () => {
    const { service } = makeService({
      employees: staff,
      homeroomRows: [
        row({
          id: 5,
          code: '3aad',
          homeroomEmployeeId: 30,
          homeroomTeacherName: 'Mustafe',
        }),
      ],
    });
    const out = await service.mine(115, 900);
    expect(out.employee).toEqual({
      id: 30,
      fullName: 'Mustafe',
      jobTitle: 'Teacher',
    });
    expect(out.items.map((c: any) => c.code)).toEqual(['3aad']);
  });

  it('is EMPTY, not an error, for a login with no staff row', async () => {
    // Every login that is not a teacher asks this on its way into Attendance —
    // the office's, the owner's, a cashier's. A 404 there would be a tab that
    // looks broken to the people who use it most.
    const { service } = makeService({ employees: staff });
    const out = await service.mine(115, 12345);
    expect(out).toEqual({ employee: null, items: [] });
  });

  it('is empty for an unauthenticated read rather than reading somebody’s classes', async () => {
    const { service } = makeService({ employees: staff });
    expect(await service.mine(115, null)).toEqual({
      employee: null,
      items: [],
    });
  });

  it('prefers the ACTIVE staff row when a user has two', async () => {
    // A rehired teacher has a closed row and a live one. The live one is the
    // employment their register belongs to.
    const { service } = makeService({ employees: staff, homeroomRows: [] });
    const out = await service.mine(115, 901);
    expect(out.employee?.id).toBe(32);
  });

  it('answers nothing for a teacher who is home room teacher of no class', async () => {
    const { service } = makeService({ employees: staff, homeroomRows: [] });
    const out = await service.mine(115, 900);
    expect(out.employee?.id).toBe(30);
    expect(out.items).toEqual([]);
  });
});

describe('SchoolClassService — a rename carries everything keyed by the code', () => {
  const TIMETABLE = () => ({
    id: 3,
    branchId: 115,
    slots: [
      { day: 1, period: 'P1', classCode: '3a', subject: 'Maths' },
      { day: 1, period: 'P1', classCode: '4aad', subject: 'Maths' },
      { day: 2, period: 'P2', classCode: '3A', subject: 'English' },
    ],
    shifts: [
      { code: 'AM', classCodes: ['1aad', '3a'] },
      { code: 'PM', classCodes: ['7th'] },
    ],
  });

  it('moves the timetable, the teachers’ grants and every lowercased table, in one transaction', async () => {
    const { service, rekey } = makeService({
      rows: [row({ id: 1, code: '3a' })],
      timetable: TIMETABLE(),
      staff: [
        { id: 70, capabilities: ['ENTER_MARKS', 'school_class:3A'] },
        { id: 71, capabilities: ['SCHOOL_CLASS:4aad'] },
        // Already granted the new code: one grant survives, not two.
        { id: 72, capabilities: ['SCHOOL_CLASS:3a', 'SCHOOL_CLASS:3aad'] },
      ],
      movedRows: {
        SchoolTextbookTitle: 4,
        SchoolTextbookLoan: 120,
        SchoolLessonPlan: 9,
        LessonAttendanceMark: 31,
      },
    });
    const out: any = await service.update(1, { branchId: 115, code: '3aad' });

    expect(out.code).toBe('3aad');
    expect(rekey.committed).toBe(true);
    expect(rekey.timetableSaved.slots.map((s: any) => s.classCode)).toEqual([
      '3aad',
      '4aad',
      '3aad',
    ]);
    expect(rekey.timetableSaved.shifts[0].classCodes).toEqual(['1aad', '3aad']);
    expect(rekey.staffUpdates).toEqual([
      { id: 70, capabilities: ['ENTER_MARKS', 'SCHOOL_CLASS:3aad'] },
      { id: 72, capabilities: ['SCHOOL_CLASS:3aad'] },
    ]);
    expect(rekey.updates.map((u: any) => u.table)).toEqual([
      SchoolTextbookTitle,
      SchoolTextbookLoan,
      SchoolLessonPlan,
      LessonAttendanceMark,
    ]);
    for (const u of rekey.updates) {
      expect(u.set).toEqual({ classCode: '3aad' });
      expect(u.where).toEqual(
        expect.arrayContaining([
          ['"branchId" = :branchId', { branchId: 115 }],
          ['"classCode" = :fromKey', { fromKey: '3a' }],
        ]),
      );
    }
    // Loans have no class in their unique key; the other three skip a row
    // the new code already holds rather than fail the rename on the index.
    expect(
      rekey.updates.map((u: any) =>
        u.where.some(([sql]: any) => /NOT EXISTS/.test(sql)),
      ),
    ).toEqual([true, false, true, true]);
    expect(out.rekeyed).toEqual({
      timetableSlots: 2,
      timetableShifts: 1,
      staffGrants: 2,
      textbookTitles: 4,
      textbookLoans: 120,
      lessonPlans: 9,
      lessonAttendance: 31,
    });
  });

  it('on a re-case, rewrites the spelled copies and leaves the lowercased tables alone', async () => {
    const target = row({ id: 1, code: '3a' });
    const { service, rekey } = makeService({
      rows: [target],
      existingByCode: target,
      timetable: TIMETABLE(),
      staff: [{ id: 70, capabilities: ['SCHOOL_CLASS:3a'] }],
    });
    const out: any = await service.update(1, { branchId: 115, code: '3A' });
    expect(rekey.timetableSaved.slots[0].classCode).toBe('3A');
    expect(rekey.staffUpdates).toEqual([
      { id: 70, capabilities: ['SCHOOL_CLASS:3A'] },
    ]);
    expect(rekey.updates).toEqual([]);
    expect(out.rekeyed.textbookLoans).toBe(0);
  });

  it('opens no transaction and moves nothing when the code is not changed', async () => {
    const { service, rekey } = makeService({
      rows: [row({ id: 1, code: '3a' })],
      timetable: TIMETABLE(),
    });
    const out: any = await service.update(1, { branchId: 115, capacity: 40 });
    expect(rekey.committed).toBe(false);
    expect(out.rekeyed).toBeUndefined();
  });
});
