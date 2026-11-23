import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SchoolStaffNoticeService } from './school-staff-notice.service';

const TEACHER = {
  id: 30,
  branchId: 115,
  fullName: 'Mustafe',
  jobTitle: 'Teacher',
  status: 'ACTIVE',
  userId: 900,
};
const DEPUTY = {
  id: 2,
  branchId: 115,
  fullName: 'Hibo',
  jobTitle: 'Deputy Director',
  status: 'ACTIVE',
  userId: 901,
};
const OTHER = {
  id: 31,
  branchId: 115,
  fullName: 'Cabdi',
  jobTitle: 'Teacher',
  status: 'ACTIVE',
  userId: 902,
};

function makeService({
  notices = [] as any[],
  employees = [TEACHER, DEPUTY, OTHER],
} = {}) {
  let nextId = 100;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(
      ([k, v]) => Number(row[k]) === Number(v as any) || row[k] === v,
    );
  const repo: any = {
    find: async ({ where }: any) =>
      notices
        .filter((r) => matches(r, where))
        .sort((a, b) => Number(b.id) - Number(a.id)),
    findOne: async ({ where }: any) =>
      notices.find((r) => matches(r, where)) || null,
    create: (p: any) => ({ ...p }),
    save: async (row: any) => {
      if (!row.id) {
        row.id = nextId++;
        row.createdAt = new Date();
        notices.push(row);
      }
      return row;
    },
    update: async (where: any, patch: any) => {
      for (const r of notices.filter((n) => matches(n, where)))
        Object.assign(r, patch);
    },
    // The read merge: the patch object, the row, the branch, the reader's key.
    query: async (_sql: string, [patch, id, branchId, key]: any[]) => {
      const row = notices.find(
        (n) => Number(n.id) === Number(id) && n.branchId === branchId,
      );
      if (row && !(key in row.readBy))
        row.readBy = { ...row.readBy, ...JSON.parse(patch) };
    },
  };
  const branchRepo: any = { findOne: async () => ({ id: 115, ownerId: 1 }) };
  const assignmentRepo: any = { findOne: async () => null };
  const employeeRepo: any = {
    find: async ({ where }: any) =>
      employees.filter(
        (e) =>
          e.branchId === where.branchId &&
          (where.userId === undefined || e.userId === where.userId),
      ),
  };
  return {
    svc: new SchoolStaffNoticeService(
      repo,
      branchRepo,
      assignmentRepo,
      employeeRepo,
    ),
    notices,
  };
}
const AS_TEACHER = { id: 900, email: 'm@x', roles: ['POS_OPERATOR'] };
const AS_DEPUTY = { id: 901, email: 'h@x', roles: ['POS_OPERATOR'] };
const AS_OTHER = { id: 902, email: 'c@x', roles: ['POS_OPERATOR'] };
const AS_OWNER = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };

describe('SchoolStaffNoticeService', () => {
  it('lets a head write to everyone or to named people, and refuses a teacher', async () => {
    const { svc } = makeService();
    const all = await svc.send(
      {
        branchId: 115,
        audience: 'ALL',
        title: 'Staff meeting',
        body: 'Thursday after P6.',
      },
      AS_DEPUTY,
    );
    expect(all).toMatchObject({
      audience: 'ALL',
      employeeIds: [],
      createdByName: 'Hibo',
      isActive: true,
    });
    const one = await svc.send(
      {
        branchId: 115,
        audience: 'PEOPLE',
        employeeIds: [30, 30],
        body: 'Bring the Grade 3 sheets.',
      },
      AS_OWNER,
    );
    expect(one).toMatchObject({
      audience: 'PEOPLE',
      employeeIds: [30],
      title: null,
    });
    await expect(
      svc.send({ branchId: 115, audience: 'ALL', body: 'x' }, AS_TEACHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.send(
        { branchId: 115, audience: 'PEOPLE', employeeIds: [], body: 'x' },
        AS_DEPUTY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.send(
        { branchId: 115, audience: 'PEOPLE', employeeIds: [4040], body: 'x' },
        AS_DEPUTY,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.send({ branchId: 115, audience: 'ALL', body: '   ' }, AS_DEPUTY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('shows a person only what reaches them, never who else has read it', async () => {
    const { svc } = makeService();
    await svc.send(
      { branchId: 115, audience: 'ALL', body: 'To all.' },
      AS_DEPUTY,
    );
    await svc.send(
      {
        branchId: 115,
        audience: 'PEOPLE',
        employeeIds: [30],
        body: 'To Mustafe.',
      },
      AS_DEPUTY,
    );
    const mine = await svc.list({ branchId: 115, mine: '1' }, AS_TEACHER);
    expect(mine.items.map((n: any) => n.body)).toEqual([
      'To Mustafe.',
      'To all.',
    ]);
    expect(mine.unread).toBe(2);
    expect(mine.items[0]).not.toHaveProperty('readBy');
    expect(mine.canSend).toBe(false);
    const others = await svc.list({ branchId: 115, mine: '1' }, AS_OTHER);
    expect(others.items.map((n: any) => n.body)).toEqual(['To all.']);
    // The office's list is the heads' alone.
    await expect(
      svc.list({ branchId: 115 }, AS_TEACHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await svc.list({ branchId: 115 }, AS_OWNER)).items).toHaveLength(2);
    // A login with no staff row has nothing to read.
    expect(
      await svc.list(
        { branchId: 115, mine: '1' },
        { id: 77, email: 'n@x', roles: [] },
      ),
    ).toMatchObject({ employee: null, items: [] });
  });

  it('records each reader once, only for a message addressed to them', async () => {
    const { svc, notices } = makeService();
    const one = await svc.send(
      {
        branchId: 115,
        audience: 'PEOPLE',
        employeeIds: [30],
        body: 'To Mustafe.',
      },
      AS_DEPUTY,
    );
    await expect(
      svc.markRead(one.id, { branchId: 115 }, AS_OTHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const first = await svc.markRead(one.id, { branchId: 115 }, AS_TEACHER);
    expect(notices[0].readBy).toEqual({ 30: first.readAt });
    const again = await svc.markRead(one.id, { branchId: 115 }, AS_TEACHER);
    expect(again.readAt).toBe(first.readAt);
    const mine = await svc.list({ branchId: 115, mine: '1' }, AS_TEACHER);
    expect(mine.unread).toBe(0);
    expect(
      (await svc.list({ branchId: 115 }, AS_DEPUTY)).items[0].readBy,
    ).toEqual({ 30: first.readAt });
  });

  it('takes a message down without losing who read it, and a taken-down message leaves the page', async () => {
    const { svc, notices } = makeService();
    const all = await svc.send(
      { branchId: 115, audience: 'ALL', body: 'To all.' },
      AS_DEPUTY,
    );
    await svc.markRead(all.id, { branchId: 115 }, AS_TEACHER);
    await expect(
      svc.setActive(all.id, { branchId: 115, isActive: false }, AS_TEACHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const down = await svc.setActive(
      all.id,
      { branchId: 115, isActive: false },
      AS_OWNER,
    );
    expect(down.isActive).toBe(false);
    expect(Object.keys(notices[0].readBy)).toEqual(['30']);
    expect(
      (await svc.list({ branchId: 115, mine: '1' }, AS_OTHER)).items,
    ).toHaveLength(0);
    await expect(
      svc.markRead(all.id, { branchId: 115 }, AS_OTHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.setActive(4040, { branchId: 115, isActive: true }, AS_OWNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
