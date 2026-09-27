import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SchoolGuardianService } from './school-guardian.service';

/* Parents' logins: the office hands a family a username; the parent then
   reads their own children and nobody else's. */

const SCHOOL = { id: 128, name: 'SMAG School', serviceFormat: 'SCHOOL', isActive: true, country: 'ET', taxEnabled: false, taxRate: 0, taxInclusive: false };
const OTHER_SCHOOL = { id: 115, name: 'SMAQ School', serviceFormat: 'SCHOOL', isActive: true, country: 'ET', taxEnabled: false, taxRate: 0, taxInclusive: false };

const folio = (id: number, branchId: number, over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  id, branchId, status: 'SUSPENDED', total: 2500, label: 'x', currency: 'ETB', itemCount: 2,
  metadata: meta, createdAt: new Date('2026-09-12'), updatedAt: new Date('2026-09-12'),
  cartSnapshot: {
    serviceFormat: 'SCHOOL', hotelGuestName: `Pupil ${id}`, hotelRoomNumber: '3aad',
    schoolAdmissionNo: `SMAG-${id}`, schoolGuardianName: 'Cali Xasan', hotelGuestPhone: '0915333513',
    cartLines: [], ...over,
  },
});

const inValues = (v: any) => (v && typeof v === 'object' && '_value' in v ? v._value : v);
const matches = (row: any, where: any) =>
  Object.entries(where || {}).every(([k, v]) => {
    const val = inValues(v);
    if (Array.isArray(val)) return val.map(Number).includes(Number(row[k])) || val.includes(row[k]);
    return row[k] === val || (typeof val === 'number' && Number(row[k]) === val);
  });

function memRepo<T extends { id?: number }>(rows: T[], seq = { n: 1000 }) {
  const repo: any = {
    rows,
    find: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)),
    findOne: async ({ where }: any) => rows.find((r) => matches(r, where)) || null,
    count: async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
    create: (p: any) => ({ ...p }),
    save: async (input: any) => {
      const list = Array.isArray(input) ? input : [input];
      for (const row of list) {
        if (!row.id) { row.id = seq.n++; rows.push(row); } else {
          const i = rows.findIndex((r) => Number(r.id) === Number(row.id));
          if (i >= 0) rows[i] = row; else rows.push(row);
        }
      }
      return input;
    },
    update: async (where: any, patch: any) => {
      for (const r of rows) if (matches(r, where)) Object.assign(r, patch);
    },
    delete: async (where: any) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], where)) rows.splice(i, 1);
    },
    remove: async (input: any) => {
      const list = Array.isArray(input) ? input : [input];
      for (const row of list) {
        const i = rows.findIndex((r) => Number(r.id) === Number(row.id));
        if (i >= 0) rows.splice(i, 1);
      }
    },
    manager: { transaction: async (fn: any) => fn({ getRepository: (entity: any) => repo.byEntity(entity) }) },
    byEntity: (_: any) => repo,
  };
  return repo;
}

/** A query builder over the memory rows, answering the handful of shapes the service builds. */
function qb(rows: any[], filter: (row: any, params: Record<string, any>) => boolean) {
  const params: Record<string, any> = {};
  const b: any = {
    where: (_: string, p?: any) => { Object.assign(params, p || {}); return b; },
    andWhere: (_: string, p?: any) => { Object.assign(params, p || {}); return b; },
    select: () => b, addSelect: () => b, orderBy: () => b, addOrderBy: () => b, take: () => b,
    getMany: async () => rows.filter((r) => filter(r, params)),
    getOne: async () => rows.find((r) => filter(r, params)) || null,
    getRawMany: async () => rows.filter((r) => filter(r, params)),
  };
  return b;
}

function makeService({ folios = [] as any[], users = [] as any[], guardians = [] as any[], pupils = [] as any[], checkouts = [] as any[], loans = [] as any[], classes = [] as any[], employees = [] as any[], slots = [] as any[] } = {}) {
  const seq = { n: 1000 };
  const cartRepo = memRepo(folios, seq);
  cartRepo.createQueryBuilder = () => qb(folios, (r, p) => Number(r.branchId) === Number(p.branchId) && r.status === 'SUSPENDED' && String(r.cartSnapshot?.serviceFormat).toUpperCase() === 'SCHOOL');
  const userRepo = memRepo(users, seq);
  userRepo.createQueryBuilder = () => qb(users, (r, p) => r.posUsername && (p.names?.includes(r.posUsername) || new RegExp(p.re).test(r.posUsername)));
  const guardianRepo = memRepo(guardians, seq);
  const pupilRepo = memRepo(pupils, seq);
  // The transaction hands back the right repo per entity.
  const byName: Record<string, any> = { User: userRepo, SchoolGuardian: guardianRepo, SchoolGuardianPupil: pupilRepo };
  guardianRepo.byEntity = (entity: any) => byName[entity.name];
  const checkoutRepo = memRepo(checkouts, seq);
  checkoutRepo.createQueryBuilder = () => qb(checkouts, (r, p) => {
    if (Number(r.branchId) !== Number(p.branchId)) return false;
    if (p.numbers) return r.transactionType === 'RETURN' && p.numbers.includes(r.metadata?.returnContext?.sourceReceiptNumber);
    return String(r.metadata?.folioId ?? '') === p.folioText || Number(r.suspendedCartId) === Number(p.folioId);
  });
  const branchRepo = memRepo([SCHOOL, OTHER_SCHOOL] as any[], seq);
  const classRepo = memRepo(classes, seq);
  classRepo.createQueryBuilder = () => qb(classes, (r, p) => Number(r.branchId) === Number(p.branchId) && String(r.code).toLowerCase() === p.code);
  const employeeRepo = memRepo(employees, seq);
  const loanRepo = memRepo(loans, seq);
  const attendance: any = {
    list: async (_type: string, q: any) => ({ items: [{ attendanceDate: '2026-09-14', subjectRef: q.subjectRef, status: 'PRESENT' }] }),
    listLessons: async () => ({ items: [] }),
  };
  const timetable: any = { get: async () => ({ title: 'Week', periods: [{ code: 'P1', kind: 'LESSON', days: [1] }], shifts: [], slots }) };
  const auth: any = {
    loginWithIdentifier: async (identifier: string, password: string) => {
      const user = users.find((u) => u.posUsername === identifier);
      if (!user || !(await bcrypt.compare(password, user.password))) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
      return { accessToken: 'at', refreshToken: 'rt', user };
    },
  };
  const svc = new SchoolGuardianService(guardianRepo, pupilRepo, cartRepo, checkoutRepo, branchRepo, userRepo, classRepo, employeeRepo, loanRepo, attendance, timetable, auth);
  return { svc, users, guardians, pupils };
}

const OFFICE = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };

describe('SchoolGuardianService — the office', () => {
  it('creates a parent login for the named pupils, refuses a pupil of another school, and a taken username', async () => {
    const { svc, users, guardians, pupils } = makeService({ folios: [folio(10, 128), folio(11, 128), folio(12, 115)] });
    const view = await svc.create({ branchId: 128, username: '0915333513', password: 'sunny-2019', displayName: 'Cali Xasan', phone: '0915333513', relationship: 'father', folioIds: [10, 11] }, OFFICE);
    expect(view).toMatchObject({ username: '0915333513', displayName: 'Cali Xasan', relationship: 'FATHER', isActive: true });
    expect(view.pupils.map((p: any) => p.name)).toEqual(['Pupil 10', 'Pupil 11']);
    expect(view.pupils[0].money).toEqual({ total: 2500, paidTotal: 0, outstanding: 2500, credit: 0 });
    const user = users[0];
    expect(user).toMatchObject({ posUsername: '0915333513', authMode: 'MANUAL', roles: [], email: 'pos.g.0915333513@sys.internal' });
    expect(await bcrypt.compare('sunny-2019', user.password)).toBe(true);
    expect(guardians).toHaveLength(1);
    expect(pupils).toHaveLength(2);

    await expect(svc.create({ branchId: 128, username: 'other', password: 'sunny-2019', folioIds: [12] }, OFFICE)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.create({ branchId: 128, username: '0915333513', password: 'sunny-2019', folioIds: [10] }, OFFICE)).rejects.toBeInstanceOf(ConflictException);
  });

  it('suggests one login per phone with the siblings together, skipping families that have one and leavers', async () => {
    const { svc } = makeService({
      folios: [
        folio(10, 128), folio(11, 128), // siblings — one phone
        folio(13, 128, { hotelGuestPhone: '+251911000000', schoolGuardianName: 'Hodan Nuur' }),
        folio(14, 128, { hotelGuestPhone: '', schoolGuardianName: 'Nobody Phone' }),
        folio(15, 128, { schoolStatus: 'INACTIVE', hotelGuestPhone: '0922222222' }),
      ],
      users: [{ id: 7, posUsername: '0911000000', password: 'x' }],
    });
    const out = await svc.suggestions(128);
    expect(out.familiesWithoutLogin).toBe(3);
    expect(out.pupilsWithoutLogin).toBe(4);
    const byPhone = Object.fromEntries(out.items.map((f: any) => [f.key, f]));
    expect(byPhone['phone:0915333513'].pupils.map((p: any) => p.folioId)).toEqual([10, 11]);
    expect(byPhone['phone:0915333513'].suggestedUsername).toBe('0915333513');
    // Taken by an existing login → suffixed.
    expect(byPhone['phone:0911000000'].suggestedUsername).toBe('0911000000.2');
    expect(byPhone['folio:14'].suggestedUsername).toBe('nobody.phone');

    // Once a family has a login, it leaves the list.
    await svc.create({ branchId: 128, username: '0915333513', password: 'sunny-2019', folioIds: [10, 11] }, OFFICE);
    expect((await svc.suggestions(128)).familiesWithoutLogin).toBe(2);
  });

  it('updates the pupils as a set, switches the login off and on, resets the password, and removes it (freeing the username)', async () => {
    const { svc, users, guardians, pupils } = makeService({ folios: [folio(10, 128), folio(11, 128), folio(16, 128)] });
    const created = await svc.create({ branchId: 128, username: 'cali', password: 'sunny-2019', folioIds: [10] }, OFFICE);
    const updated = await svc.update(created.id, { branchId: 128, folioIds: [11, 16], phone: '0900', isActive: false });
    expect(updated.pupils.map((p: any) => p.folioId)).toEqual([11, 16]);
    expect(updated).toMatchObject({ isActive: false, phone: '0900' });
    expect(pupils.map((p) => Number(p.folioId)).sort()).toEqual([11, 16]);

    await svc.resetPassword(created.id, { branchId: 128, password: 'new-pass-1' });
    expect(await bcrypt.compare('new-pass-1', users[0].password)).toBe(true);
    expect(guardians[0].passwordIssuedAt).toBeInstanceOf(Date);

    await expect(svc.update(created.id, { branchId: 115 })).rejects.toBeInstanceOf(NotFoundException);
    const gone = await svc.remove(created.id, 128);
    expect(gone).toMatchObject({ status: 'REMOVED', userRemoved: true });
    expect(users).toHaveLength(0);
    expect(pupils).toHaveLength(0);
  });
});

describe('SchoolGuardianService — the parent', () => {
  async function family() {
    const made = makeService({
      folios: [
        folio(10, 128, { paid: true }), folio(11, 128), folio(12, 115),
        folio(99, 128, { hotelGuestName: 'Somebody Else' }),
      ],
      checkouts: [
        { id: 1, branchId: 128, transactionType: 'SALE', status: 'PROCESSED', receiptNumber: 'POS-128-1', total: 2500, occurredAt: new Date('2026-09-15'), metadata: { folioId: 10 }, tenders: [{ method: 'CASH', amount: 2500 }], items: [], cashierName: 'Hibo' },
        { id: 2, branchId: 128, transactionType: 'RETURN', status: 'PROCESSED', receiptNumber: 'POS-128-2', total: 500, occurredAt: new Date('2026-09-16'), metadata: { returnContext: { sourceReceiptNumber: 'POS-128-1' } }, tenders: [], items: [] },
        { id: 3, branchId: 128, transactionType: 'SALE', status: 'PROCESSED', receiptNumber: 'POS-128-3', total: 100, occurredAt: new Date('2026-09-17'), metadata: { folioId: 99 }, tenders: [], items: [] },
      ],
      loans: [{ id: 5, branchId: 128, folioId: 10, classCode: '3aad', title: 'Maths', status: 'ISSUED', issuedAt: '2026-09-13', returnedAt: null }],
      classes: [{ id: 3, branchId: 128, code: '3aad', name: 'Grade 3', gradeCode: '3aad', section: 'A', homeroomEmployeeId: 30, homeroomTeacherName: null }],
      employees: [{ id: 30, branchId: 128, fullName: 'Mustafe', jobTitle: 'Teacher', status: 'ACTIVE' }],
      slots: [{ day: 1, period: 'P1', classCode: '3AAD', subject: 'Maths', teacherName: 'Mustafe', employeeId: 30 }, { day: 1, period: 'P1', classCode: '4aad', subject: 'English', teacherName: 'X', employeeId: null }],
    });
    await made.svc.create({ branchId: 128, username: '0915333513', password: 'sunny-2019', displayName: 'Cali Xasan', folioIds: [10, 11] }, OFFICE);
    return made;
  }

  it('signs a parent in and lists their schools and children; a login with no guardianship is refused', async () => {
    const { svc, users, guardians } = await family();
    const out = await svc.login('0915333513', 'sunny-2019');
    expect(out).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
    expect(out.user).toMatchObject({ username: '0915333513', displayName: 'Cali Xasan', canChangePassword: true });
    expect(out.schools).toHaveLength(1);
    expect(out.schools[0]).toMatchObject({ branchId: 128, name: 'SMAG School' });
    expect(out.schools[0].pupils.map((p: any) => [p.folioId, p.money.outstanding])).toEqual([[10, 0], [11, 2500]]);
    expect(guardians[0].lastLoginAt).toBeInstanceOf(Date);

    await expect(svc.login('0915333513', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.login('someone@x.com', 'sunny-2019')).rejects.toBeInstanceOf(UnauthorizedException);

    users.push({ id: 500, posUsername: 'teacher', password: await bcrypt.hash('pw', 4), authMode: 'MANUAL', isActive: true });
    await expect(svc.login('teacher', 'pw')).rejects.toBeInstanceOf(ForbiddenException);

    // Switched off by the office → refused, even with the right password.
    guardians[0].isActive = false;
    await expect(svc.login('0915333513', 'sunny-2019')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.me(users[0].id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads one child in full — record, receipts (with the refund), register, books, class week, class teacher — and only a linked child', async () => {
    const { svc, users } = await family();
    const me = users[0].id;
    const out = await svc.pupil(me, 10);
    expect(out.pupil).toMatchObject({ folioId: 10, name: 'Pupil 10', classCode: '3aad', className: 'Grade 3', section: 'A', status: 'ACTIVE' });
    expect(out.pupil.money).toEqual({ total: 2500, paidTotal: 2500, outstanding: 0, credit: 0 });
    expect(out.classTeacher).toEqual({ fullName: 'Mustafe', jobTitle: 'Teacher' });
    expect(out.folio.cartSnapshot.hotelGuestName).toBe('Pupil 10');
    expect(out.receipts.map((r: any) => r.receiptNumber)).toEqual(['POS-128-2', 'POS-128-1']);
    expect(out.receipts[1]).not.toHaveProperty('cashierName');
    expect(out.attendance.days).toHaveLength(1);
    expect(out.textbooks).toEqual([expect.objectContaining({ title: 'Maths', status: 'ISSUED' })]);
    expect(out.timetable.slots).toEqual([expect.objectContaining({ classCode: '3AAD', subject: 'Maths' })]);
    expect(out.school).toMatchObject({ branchId: 128, name: 'SMAG School' });

    // Another family's child, a child at a school this login is not at, nonsense.
    await expect(svc.pupil(me, 99)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.pupil(me, 12)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.pupil(me, 424242)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.pupil(0, 10)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a parent change their own password with the current one', async () => {
    const { svc, users } = await family();
    const me = users[0].id;
    await expect(svc.changePassword(me, { currentPassword: 'nope', newPassword: 'longer-1' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.changePassword(me, { currentPassword: 'sunny-2019', newPassword: 'longer-1' })).resolves.toEqual({ status: 'PASSWORD_CHANGED' });
    expect(await bcrypt.compare('longer-1', users[0].password)).toBe(true);
    await expect(svc.changePassword(4242, { currentPassword: 'x', newPassword: 'longer-1' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
