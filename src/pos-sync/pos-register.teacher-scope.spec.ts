import { NotFoundException } from '@nestjs/common';
import { PosRegisterService } from './pos-register.service';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import { SchoolClass } from '../school/entities/school-class.entity';

/**
 * A teacher's roll is their own classes' pupils (owner 2026-11-22). The page
 * already hid the rest; these pin that the LIST no longer sends it — and that
 * nobody but a teacher-lane login is narrowed, because every other till on
 * the platform polls this same route.
 */
function make({
  assignment = null as any,
  ownerId = 1,
  employees = [] as any[],
  rooms = [] as any[],
  row = null as any,
} = {}) {
  const wheres: Array<{ sql: string; params: any }> = [];
  const qb: any = {
    where: jest.fn((sql: string, params: any) => {
      wheres.push({ sql, params });
      return qb;
    }),
    andWhere: jest.fn((sql: string, params: any) => {
      wheres.push({ sql, params });
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    getRawOne: jest.fn(async () => ({ count: 0, latest: null })),
    getManyAndCount: jest.fn(async () => [[], 0]),
  };
  const find = jest.fn(async (entity: any) =>
    entity === BranchEmployee ? employees : entity === SchoolClass ? rooms : [],
  );
  const carts: any = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(async () => row),
    manager: { find },
  };
  const assignments = { findOne: jest.fn(async () => assignment) };
  const service = new PosRegisterService(
    { findOne: jest.fn() } as any,
    carts,
    { findOne: jest.fn(async () => ({ id: 150, ownerId })) } as any,
    { dispatchCloseReport: jest.fn() } as any,
    assignments as any,
  );
  return { service, wheres, assignments, find };
}

const TEACHER = {
  role: 'OPERATOR',
  isActive: true,
  posExperienceProfileCode: 'SCHOOL_TEACHER',
  capabilities: [],
};
const teacher = { id: 2880, roles: ['POS_OPERATOR'] };

describe('teacherClassScope — who is held, and to what', () => {
  it('holds a teacher to their home room and the classes on their login', async () => {
    const { service } = make({
      assignment: {
        ...TEACHER,
        capabilities: ['SCHOOL_CLASS:4B', 'ENTER_MARKS'],
      },
      employees: [{ id: 83, status: 'ACTIVE' }],
      rooms: [{ id: 42, code: '1A' }],
    });
    expect((await service.teacherClassScope(150, teacher)).sort()).toEqual([
      '1a',
      '4b',
    ]);
  });

  it('gives a teacher with no class an empty scope — nothing, not everything', async () => {
    const { service } = make({ assignment: TEACHER });
    expect(await service.teacherClassScope(150, teacher)).toEqual([]);
  });

  it('never narrows a manager, the owner, a cashier or the platform’s staff', async () => {
    // Owner and manager accounts: no lookup at all.
    const fast = make({ assignment: TEACHER });
    for (const roles of [
      ['POS_MANAGER'],
      ['VENDOR', 'POS_MANAGER'],
      ['SUPER_ADMIN'],
      ['ADMIN'],
    ]) {
      expect(
        await fast.service.teacherClassScope(150, { id: 9, roles }),
      ).toBeNull();
    }
    expect(fast.assignments.findOne).not.toHaveBeenCalled();
    for (const assignment of [
      { ...TEACHER, posExperienceProfileCode: 'SCHOOL_CASHIER' },
      { ...TEACHER, posExperienceProfileCode: null },
      { ...TEACHER, role: 'MANAGER' },
      { ...TEACHER, isActive: false },
      null,
    ]) {
      const { service } = make({ assignment });
      expect(await service.teacherClassScope(150, teacher)).toBeNull();
    }
    const owner = make({ assignment: TEACHER, ownerId: 2880 });
    expect(await owner.service.teacherClassScope(150, teacher)).toBeNull();
  });

  it('answers a poll from memory for a minute rather than from the database', async () => {
    const { service, assignments } = make({ assignment: TEACHER });
    await service.teacherClassScope(150, teacher);
    await service.teacherClassScope(150, teacher);
    expect(assignments.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('the list and the single read, under a scope', () => {
  const query: any = { branchId: 150, status: 'SUSPENDED', limit: 100 };
  const classFilter = (wheres: any[]) =>
    wheres.find((w) => /hotelRoomNumber/.test(w.sql) || w.sql === '1 = 0');

  it('filters the page AND its version check to the classes', async () => {
    const { service, wheres } = make();
    await service.findSuspendedCartsConditional(query, null, ['1a', '4b']);
    const filters = wheres.filter((w) => /hotelRoomNumber/.test(w.sql));
    expect(filters).toHaveLength(2); // the aggregate, then the page
    expect(filters[0].params).toEqual({ classCodes: ['1a', '4b'] });
  });

  it('reads nothing for an empty scope, and everything for none', async () => {
    const none = make();
    await none.service.findSuspendedCarts(query, []);
    expect(classFilter(none.wheres).sql).toBe('1 = 0');
    const all = make();
    await all.service.findSuspendedCarts(query);
    expect(classFilter(all.wheres)).toBeUndefined();
  });

  it('404s a pupil of another class for a teacher, and reads their own', async () => {
    const row = {
      id: 7,
      branchId: 150,
      cartSnapshot: { hotelRoomNumber: '1A' },
    };
    const { service } = make({ row });
    await expect(
      service.findSuspendedCartOnBranch(7, 150, ['4b']),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.findSuspendedCartOnBranch(7, 150, ['1a']),
    ).resolves.toMatchObject({ id: 7 });
    await expect(
      service.findSuspendedCartOnBranch(7, 150),
    ).resolves.toMatchObject({ id: 7 });
  });
});
