import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SchoolGuardianService } from './school-guardian.service';
import { SchoolHomeworkService } from './school-homework.service';
import { SchoolMessageService } from './school-message.service';
import { SchoolStatementCodeService } from './school-statement-code.service';
import { memRepo, qb, reachStub } from './test/memory-repo';

/* Parents' logins: the office hands a family a username; the parent then
   reads their own children and nobody else's. */

const SCHOOL = {
  id: 128,
  name: 'SMAG School',
  serviceFormat: 'SCHOOL',
  isActive: true,
  country: 'ET',
  taxEnabled: false,
  taxRate: 0,
  taxInclusive: false,
};
const OTHER_SCHOOL = {
  id: 115,
  name: 'SMAQ School',
  serviceFormat: 'SCHOOL',
  isActive: true,
  country: 'ET',
  taxEnabled: false,
  taxRate: 0,
  taxInclusive: false,
};

const folio = (
  id: number,
  branchId: number,
  over: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
) => ({
  id,
  branchId,
  status: 'SUSPENDED',
  total: 2500,
  label: 'x',
  currency: 'ETB',
  itemCount: 2,
  metadata: meta,
  createdAt: new Date('2026-09-12'),
  updatedAt: new Date('2026-09-12'),
  cartSnapshot: {
    serviceFormat: 'SCHOOL',
    hotelGuestName: `Pupil ${id}`,
    hotelRoomNumber: '3aad',
    schoolAdmissionNo: `SMAG-${id}`,
    schoolGuardianName: 'Cali Xasan',
    hotelGuestPhone: '0915333513',
    cartLines: [],
    ...over,
  },
});

function makeService({
  folios = [] as any[],
  users = [] as any[],
  guardians = [] as any[],
  pupils = [] as any[],
  checkouts = [] as any[],
  loans = [] as any[],
  classes = [] as any[],
  employees = [] as any[],
  slots = [] as any[],
  notices = [] as any[],
} = {}) {
  const seq = { n: 1000 };
  const cartRepo = memRepo(folios, seq);
  cartRepo.createQueryBuilder = () =>
    qb(
      folios,
      (r, p) =>
        Number(r.branchId) === Number(p.branchId) &&
        r.status === 'SUSPENDED' &&
        String(r.cartSnapshot?.serviceFormat).toUpperCase() === 'SCHOOL',
    );
  const userRepo = memRepo(users, seq);
  userRepo.createQueryBuilder = () =>
    qb(
      users,
      (r, p) =>
        r.posUsername &&
        (p.names?.includes(r.posUsername) ||
          new RegExp(p.re).test(r.posUsername)),
    );
  const guardianRepo = memRepo(guardians, seq);
  const pupilRepo = memRepo(pupils, seq);
  // The transaction hands back the right repo per entity.
  const byName: Record<string, any> = {
    User: userRepo,
    SchoolGuardian: guardianRepo,
    SchoolGuardianPupil: pupilRepo,
  };
  guardianRepo.byEntity = (entity: any) => byName[entity.name];
  const checkoutRepo = memRepo(checkouts, seq);
  checkoutRepo.createQueryBuilder = () =>
    qb(checkouts, (r, p) => {
      if (Number(r.branchId) !== Number(p.branchId)) return false;
      if (p.numbers)
        return (
          r.transactionType === 'RETURN' &&
          p.numbers.includes(r.metadata?.returnContext?.sourceReceiptNumber)
        );
      return (
        String(r.metadata?.folioId ?? '') === p.folioText ||
        Number(r.suspendedCartId) === Number(p.folioId)
      );
    });
  const branchRepo = memRepo([SCHOOL, OTHER_SCHOOL] as any[], seq);
  const classRepo = memRepo(classes, seq);
  classRepo.createQueryBuilder = () =>
    qb(
      classes,
      (r, p) =>
        Number(r.branchId) === Number(p.branchId) &&
        String(r.code).toLowerCase() === p.code,
    );
  const employeeRepo = memRepo(employees, seq);
  const loanRepo = memRepo(loans, seq);
  const attendance: any = {
    today: [] as any[],
    list: async (_type: string, q: any) =>
      q.date
        ? {
            items: attendance.today.filter(
              (m: any) => m.attendanceDate === q.date,
            ),
          }
        : {
            items: [
              {
                attendanceDate: '2026-09-14',
                subjectRef: q.subjectRef,
                status: 'PRESENT',
              },
            ],
          },
    listLessons: async () => ({ items: [] }),
  };
  const timetable: any = {
    get: async () => ({
      title: 'Week',
      periods: [{ code: 'P1', kind: 'LESSON', days: [1] }],
      shifts: [],
      slots,
    }),
  };
  const auth: any = {
    loginWithIdentifier: async (identifier: string, password: string) => {
      const user = users.find((u) => u.posUsername === identifier);
      if (!user || !(await bcrypt.compare(password, user.password)))
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
      return { accessToken: 'at', refreshToken: 'rt', user };
    },
  };
  const noticeRepo = memRepo(notices, seq);
  // The teachers' side, with a head's reach: the guardian service only READS
  // through these (a class's homework, the family's unread), so who set what
  // is the homework and message specs' business.
  const homeworkRows: any[] = [];
  const homeworkRepo = memRepo(homeworkRows, seq);
  homeworkRepo.createQueryBuilder = () =>
    qb(homeworkRows, (r, p) => Number(r.branchId) === Number(p.branchId));
  const reach = reachStub(() => ({
    head: true,
    employee: { id: 30, fullName: 'Mustafe' },
    name: 'Mustafe',
  }));
  const homework = new SchoolHomeworkService(homeworkRepo, reach);
  const messages = new SchoolMessageService(
    memRepo([], seq),
    memRepo([], seq),
    guardianRepo,
    pupilRepo,
    cartRepo,
    userRepo,
    reach,
  );
  const statementCodes = new SchoolStatementCodeService(memRepo([], seq));
  const svc = new SchoolGuardianService(
    guardianRepo,
    pupilRepo,
    cartRepo,
    checkoutRepo,
    branchRepo,
    userRepo,
    classRepo,
    employeeRepo,
    loanRepo,
    noticeRepo,
    attendance,
    timetable,
    auth,
    homework,
    messages,
    statementCodes,
  );
  return {
    svc,
    users,
    guardians,
    pupils,
    notices,
    homework,
    messages,
    attendance,
  };
}

const OFFICE = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };

describe('SchoolGuardianService — the office', () => {
  it('creates a parent login for the named pupils, refuses a pupil of another school, and a taken username', async () => {
    const { svc, users, guardians, pupils } = makeService({
      folios: [folio(10, 128), folio(11, 128), folio(12, 115)],
    });
    const view = await svc.create(
      {
        branchId: 128,
        username: '0915333513',
        password: 'sunny-2019',
        displayName: 'Cali Xasan',
        phone: '0915333513',
        relationship: 'father',
        folioIds: [10, 11],
      },
      OFFICE,
    );
    expect(view).toMatchObject({
      username: '0915333513',
      displayName: 'Cali Xasan',
      relationship: 'FATHER',
      isActive: true,
    });
    expect(view.pupils.map((p: any) => p.name)).toEqual([
      'Pupil 10',
      'Pupil 11',
    ]);
    expect(view.pupils[0].money).toEqual({
      total: 2500,
      paidTotal: 0,
      outstanding: 2500,
      credit: 0,
    });
    const user = users[0];
    expect(user).toMatchObject({
      posUsername: '0915333513',
      authMode: 'MANUAL',
      roles: [],
      email: 'pos.g.0915333513@sys.internal',
    });
    expect(await bcrypt.compare('sunny-2019', user.password)).toBe(true);
    expect(guardians).toHaveLength(1);
    expect(pupils).toHaveLength(2);

    await expect(
      svc.create(
        {
          branchId: 128,
          username: 'other',
          password: 'sunny-2019',
          folioIds: [12],
        },
        OFFICE,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.create(
        {
          branchId: 128,
          username: '0915333513',
          password: 'sunny-2019',
          folioIds: [10],
        },
        OFFICE,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('suggests one login per phone with the siblings together, skipping families that have one and leavers', async () => {
    const { svc } = makeService({
      folios: [
        folio(10, 128),
        folio(11, 128), // siblings — one phone
        folio(13, 128, {
          hotelGuestPhone: '+251911000000',
          schoolGuardianName: 'Hodan Nuur',
        }),
        folio(14, 128, {
          hotelGuestPhone: '',
          schoolGuardianName: 'Nobody Phone',
        }),
        folio(15, 128, {
          schoolStatus: 'INACTIVE',
          hotelGuestPhone: '0922222222',
        }),
      ],
      users: [{ id: 7, posUsername: '0911000000', password: 'x' }],
    });
    const out = await svc.suggestions(128);
    expect(out.familiesWithoutLogin).toBe(3);
    expect(out.pupilsWithoutLogin).toBe(4);
    const byPhone = Object.fromEntries(out.items.map((f: any) => [f.key, f]));
    expect(
      byPhone['phone:0915333513'].pupils.map((p: any) => p.folioId),
    ).toEqual([10, 11]);
    expect(byPhone['phone:0915333513'].suggestedUsername).toBe('0915333513');
    // Taken by an existing login → suffixed.
    expect(byPhone['phone:0911000000'].suggestedUsername).toBe('0911000000.2');
    expect(byPhone['folio:14'].suggestedUsername).toBe('nobody.phone');

    // Once a family has a login, it leaves the list.
    await svc.create(
      {
        branchId: 128,
        username: '0915333513',
        password: 'sunny-2019',
        folioIds: [10, 11],
      },
      OFFICE,
    );
    expect((await svc.suggestions(128)).familiesWithoutLogin).toBe(2);

    // Switched off is still "has a login": the office cut that family off on
    // purpose, and offering them again made "Create logins for all" hand them
    // a second, working one.
    const made = (await svc.list(128)).items.find(
      (g: any) => g.username === '0915333513',
    );
    await svc.update(made.id, { branchId: 128, isActive: false }, OFFICE);
    const after = await svc.suggestions(128);
    expect(after.familiesWithoutLogin).toBe(2);
    expect(after.items.map((f: any) => f.key)).not.toContain(
      'phone:0915333513',
    );
  });

  it('updates the pupils as a set, switches the login off and on, resets the password, and removes it (freeing the username)', async () => {
    const { svc, users, guardians, pupils } = makeService({
      folios: [folio(10, 128), folio(11, 128), folio(16, 128)],
    });
    const created = await svc.create(
      {
        branchId: 128,
        username: 'cali',
        password: 'sunny-2019',
        folioIds: [10],
      },
      OFFICE,
    );
    const updated = await svc.update(created.id, {
      branchId: 128,
      folioIds: [11, 16],
      phone: '0900',
      isActive: false,
    });
    expect(updated.pupils.map((p: any) => p.folioId)).toEqual([11, 16]);
    expect(updated).toMatchObject({ isActive: false, phone: '0900' });
    expect(pupils.map((p) => Number(p.folioId)).sort()).toEqual([11, 16]);

    await svc.resetPassword(created.id, {
      branchId: 128,
      password: 'new-pass-1',
    });
    expect(await bcrypt.compare('new-pass-1', users[0].password)).toBe(true);
    expect(guardians[0].passwordIssuedAt).toBeInstanceOf(Date);

    await expect(
      svc.update(created.id, { branchId: 115 }),
    ).rejects.toBeInstanceOf(NotFoundException);
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
        folio(10, 128, { paid: true }),
        folio(11, 128),
        folio(12, 115),
        folio(99, 128, { hotelGuestName: 'Somebody Else' }),
      ],
      checkouts: [
        {
          id: 1,
          branchId: 128,
          transactionType: 'SALE',
          status: 'PROCESSED',
          receiptNumber: 'POS-128-1',
          total: 2500,
          occurredAt: new Date('2026-09-15'),
          metadata: { folioId: 10 },
          tenders: [{ method: 'CASH', amount: 2500 }],
          items: [],
          cashierName: 'Hibo',
        },
        {
          id: 2,
          branchId: 128,
          transactionType: 'RETURN',
          status: 'PROCESSED',
          receiptNumber: 'POS-128-2',
          total: 500,
          occurredAt: new Date('2026-09-16'),
          metadata: { returnContext: { sourceReceiptNumber: 'POS-128-1' } },
          tenders: [],
          items: [],
        },
        {
          id: 3,
          branchId: 128,
          transactionType: 'SALE',
          status: 'PROCESSED',
          receiptNumber: 'POS-128-3',
          total: 100,
          occurredAt: new Date('2026-09-17'),
          metadata: { folioId: 99 },
          tenders: [],
          items: [],
        },
      ],
      loans: [
        {
          id: 5,
          branchId: 128,
          folioId: 10,
          classCode: '3aad',
          title: 'Maths',
          status: 'ISSUED',
          issuedAt: '2026-09-13',
          returnedAt: null,
        },
      ],
      classes: [
        {
          id: 3,
          branchId: 128,
          code: '3aad',
          name: 'Grade 3',
          gradeCode: '3aad',
          section: 'A',
          homeroomEmployeeId: 30,
          homeroomTeacherName: null,
        },
      ],
      employees: [
        {
          id: 30,
          branchId: 128,
          fullName: 'Mustafe',
          jobTitle: 'Teacher',
          status: 'ACTIVE',
        },
      ],
      slots: [
        {
          day: 1,
          period: 'P1',
          classCode: '3AAD',
          subject: 'Maths',
          teacherName: 'Mustafe',
          employeeId: 30,
        },
        {
          day: 1,
          period: 'P1',
          classCode: '4aad',
          subject: 'English',
          teacherName: 'X',
          employeeId: null,
        },
      ],
    });
    await made.svc.create(
      {
        branchId: 128,
        username: '0915333513',
        password: 'sunny-2019',
        displayName: 'Cali Xasan',
        folioIds: [10, 11],
      },
      OFFICE,
    );
    return made;
  }

  it('signs a parent in and lists their schools and children; a login with no guardianship is refused', async () => {
    const { svc, users, guardians } = await family();
    const out = await svc.login('0915333513', 'sunny-2019');
    expect(out).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
    expect(out.user).toMatchObject({
      username: '0915333513',
      displayName: 'Cali Xasan',
      canChangePassword: true,
    });
    expect(out.schools).toHaveLength(1);
    expect(out.schools[0]).toMatchObject({
      branchId: 128,
      name: 'SMAG School',
    });
    expect(
      out.schools[0].pupils.map((p: any) => [p.folioId, p.money.outstanding]),
    ).toEqual([
      [10, 0],
      [11, 2500],
    ]);
    expect(guardians[0].lastLoginAt).toBeInstanceOf(Date);

    await expect(svc.login('0915333513', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      svc.login('someone@x.com', 'sunny-2019'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    users.push({
      id: 500,
      posUsername: 'teacher',
      password: await bcrypt.hash('pw', 4),
      authMode: 'MANUAL',
      isActive: true,
    });
    await expect(svc.login('teacher', 'pw')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // Switched off by the office → refused, even with the right password.
    guardians[0].isActive = false;
    await expect(svc.login('0915333513', 'sunny-2019')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.me(users[0].id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reads one child in full — record, receipts (with the refund), register, books, class week, class teacher — and only a linked child', async () => {
    const { svc, users } = await family();
    const me = users[0].id;
    const out = await svc.pupil(me, 10);
    expect(out.pupil).toMatchObject({
      folioId: 10,
      name: 'Pupil 10',
      classCode: '3aad',
      className: 'Grade 3',
      section: 'A',
      status: 'ACTIVE',
    });
    expect(out.pupil.money).toEqual({
      total: 2500,
      paidTotal: 2500,
      outstanding: 0,
      credit: 0,
    });
    expect(out.classTeacher).toEqual({
      fullName: 'Mustafe',
      jobTitle: 'Teacher',
    });
    expect(out.folio.cartSnapshot.hotelGuestName).toBe('Pupil 10');
    expect(out.receipts.map((r: any) => r.receiptNumber)).toEqual([
      'POS-128-2',
      'POS-128-1',
    ]);
    expect(out.receipts[1]).not.toHaveProperty('cashierName');
    expect(out.attendance.days).toHaveLength(1);
    expect(out.textbooks).toEqual([
      expect.objectContaining({ title: 'Maths', status: 'ISSUED' }),
    ]);
    expect(out.timetable.slots).toEqual([
      expect.objectContaining({ classCode: '3AAD', subject: 'Maths' }),
    ]);
    expect(out.school).toMatchObject({ branchId: 128, name: 'SMAG School' });

    // Another family's child, a child at a school this login is not at, nonsense.
    await expect(svc.pupil(me, 99)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.pupil(me, 12)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.pupil(me, 424242)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.pupil(0, 10)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a parent change their own password with the current one', async () => {
    const { svc, users } = await family();
    const me = users[0].id;
    await expect(
      svc.changePassword(me, {
        currentPassword: 'nope',
        newPassword: 'longer-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.changePassword(me, {
        currentPassword: 'sunny-2019',
        newPassword: 'longer-1',
      }),
    ).resolves.toEqual({ status: 'PASSWORD_CHANGED' });
    expect(await bcrypt.compare('longer-1', users[0].password)).toBe(true);
    await expect(
      svc.changePassword(4242, {
        currentPassword: 'x',
        newPassword: 'longer-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SchoolGuardianService — notices and the issued-password nudge', () => {
  it('the office posts a notice to the whole school or to classes; a family reads only what reaches their children, live and unexpired', async () => {
    const { svc, users } = makeService({
      folios: [folio(10, 128), folio(11, 128, { hotelRoomNumber: '4aad' })],
    });
    await svc.create(
      {
        branchId: 128,
        username: 'cali',
        password: 'sunny-2019',
        folioIds: [10, 11],
      },
      OFFICE,
    );
    const all = await svc.createNotice(
      { branchId: 128, title: 'Holiday', body: 'Closed Monday' },
      OFFICE,
    );
    expect(all).toMatchObject({
      audience: 'ALL',
      classCodes: [],
      isActive: true,
      createdByName: null,
    });
    const cls = await svc.createNotice(
      {
        branchId: 128,
        title: 'Exam 4aad',
        body: 'Bring pencils',
        audience: 'CLASSES',
        classCodes: ['4AAD'],
      },
      OFFICE,
    );
    expect(cls.classCodes).toEqual(['4aad']);
    const other = await svc.createNotice(
      {
        branchId: 128,
        title: 'Exam 9aad',
        body: 'x',
        audience: 'CLASSES',
        classCodes: ['9aad'],
      },
      OFFICE,
    );
    const expired = await svc.createNotice(
      { branchId: 128, title: 'Old', body: 'x', expiresAt: '2020-01-01' },
      OFFICE,
    );
    await expect(
      svc.createNotice(
        {
          branchId: 128,
          title: 'x',
          body: 'x',
          audience: 'CLASSES',
          classCodes: [],
        },
        OFFICE,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await svc.updateNotice(other.id, { branchId: 128, isActive: false });
    await expect(
      svc.updateNotice(other.id, { branchId: 115 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // The memory repo keeps insertion order (the real one sorts newest first).
    expect(
      (await svc.listNotices(128)).items
        .map((n: any) => [n.title, n.isActive])
        .sort(),
    ).toEqual([
      ['Exam 4aad', true],
      ['Exam 9aad', false],
      ['Holiday', true],
      ['Old', true],
    ]);

    const me = await svc.me(users[0].id);
    expect(me.notices.map((n: any) => n.title).sort()).toEqual([
      'Exam 4aad',
      'Holiday',
    ]);
    expect(me.notices.find((n: any) => n.title === 'Exam 4aad')).toMatchObject({
      schoolName: 'SMAG School',
      audience: 'CLASSES',
      classCodes: ['4aad'],
    });
    expect(me.notices.some((n: any) => n.title === 'Old')).toBe(false);

    await svc.removeNotice(expired.id, 128);
    expect((await svc.listNotices(128)).items).toHaveLength(3);
  });

  it('says a parent is still on the office’s password until they change it themselves, and again after a reset', async () => {
    const { svc, users, guardians } = makeService({ folios: [folio(10, 128)] });
    const created = await svc.create(
      {
        branchId: 128,
        username: 'cali',
        password: 'sunny-2019',
        folioIds: [10],
      },
      OFFICE,
    );
    const me = users[0].id;
    expect((await svc.me(me)).user.usingIssuedPassword).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    await svc.changePassword(me, {
      currentPassword: 'sunny-2019',
      newPassword: 'my-own-1',
    });
    expect(guardians[0].passwordChangedAt).toBeInstanceOf(Date);
    expect((await svc.me(me)).user.usingIssuedPassword).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await svc.resetPassword(created.id, {
      branchId: 128,
      password: 'office-2',
    });
    expect((await svc.me(me)).user.usingIssuedPassword).toBe(true);
  });

  it('hands a family only their own pupil’s attendance rows even if the register read were widened', async () => {
    const { svc, users } = makeService({ folios: [folio(10, 128)] });
    await svc.create(
      {
        branchId: 128,
        username: 'cali',
        password: 'sunny-2019',
        folioIds: [10],
      },
      OFFICE,
    );
    const out = await svc.pupil(users[0].id, 10);
    expect(out.attendance.days.map((d: any) => d.subjectRef)).toEqual(['10']);
  });
});

describe('SchoolGuardianService — the teachers’ side on the family’s page', () => {
  it('flags today’s mark, unread messages and homework due on the home page, and hands the child’s page the class’s homework and their place', async () => {
    const { svc, users, homework, messages, attendance } = makeService({
      folios: [
        folio(10, 128, {
          schoolAcademicRecord: {
            reports: [
              {
                term: '2019-S1',
                position: '',
                subjects: [
                  { subject: 'Maths', total: 80, outOf: 100 },
                  { subject: 'English', total: 60, outOf: 100 },
                ],
              },
            ],
          },
        }),
        folio(11, 128, { hotelRoomNumber: '4aad' }),
        // Classmates of 10 in 3aad — one ahead, one behind, one in another term.
        folio(20, 128, {
          hotelGuestName: 'Ahead',
          schoolAcademicRecord: {
            reports: [
              {
                term: '2019-S1',
                subjects: [
                  { subject: 'Maths', total: 90 },
                  { subject: 'English', total: 90 },
                ],
              },
            ],
          },
        }),
        folio(21, 128, {
          hotelGuestName: 'Behind',
          schoolAcademicRecord: {
            reports: [
              {
                term: '2019-S1',
                subjects: [
                  { subject: 'Maths', total: 40 },
                  { subject: 'English', total: 40 },
                ],
              },
            ],
          },
        }),
        folio(22, 128, {
          hotelGuestName: 'Left',
          schoolStatus: 'INACTIVE',
          schoolAcademicRecord: {
            reports: [
              {
                term: '2019-S1',
                subjects: [
                  { subject: 'Maths', total: 100 },
                  { subject: 'English', total: 100 },
                ],
              },
            ],
          },
        }),
      ],
    });
    await svc.create(
      {
        branchId: 128,
        username: 'cali',
        password: 'sunny-2019',
        displayName: 'Cali Xasan',
        folioIds: [10, 11],
      },
      OFFICE,
    );
    const me = users[0].id;
    const today = (await svc.me(me)).schools[0].today;
    attendance.today.push({
      attendanceDate: today,
      subjectRef: '10',
      status: 'ABSENT',
      note: 'no word',
    });
    await homework.create(
      {
        branchId: 128,
        classCode: '3aad',
        subject: 'Maths',
        title: 'Page 4',
        dueOn: '2099-01-01',
      },
      OFFICE,
    );
    await homework.create(
      {
        branchId: 128,
        classCode: '3aad',
        subject: 'Maths',
        title: 'Old',
        dueOn: '2020-01-01',
      },
      OFFICE,
    );
    await homework.create(
      {
        branchId: 128,
        classCode: '9aad',
        subject: 'Maths',
        title: 'Not ours',
        dueOn: '2099-01-01',
      },
      OFFICE,
    );
    await messages.openThread(
      { branchId: 128, folioId: 11, body: 'Books please' },
      OFFICE,
    );

    const home = await svc.me(me);
    const [p10, p11] = home.schools[0].pupils;
    expect(p10).toMatchObject({
      folioId: 10,
      todayMark: { status: 'ABSENT', note: 'no word' },
      unreadMessages: 0,
      homeworkDue: 1,
    });
    expect(p11).toMatchObject({
      folioId: 11,
      todayMark: null,
      unreadMessages: 1,
      homeworkDue: 0,
    });

    const page = await svc.pupil(me, 10);
    // The statement's QR token: minted once, the same on every read.
    expect(page.verification.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{14}$/);
    expect((await svc.pupil(me, 10)).verification.code).toBe(
      page.verification.code,
    );
    expect((await svc.pupil(me, 11)).verification.code).not.toBe(
      page.verification.code,
    );
    expect(page.homework.map((h: any) => h.title).sort()).toEqual([
      'Old',
      'Page 4',
    ]);
    expect(page.unreadMessages).toBe(0);
    // 2nd of 3 live classmates with marks this term — the leaver does not count.
    expect(page.rank).toEqual([
      {
        term: '2019-S1',
        recordedPosition: null,
        position: 2,
        of: 3,
        complete: true,
        subjectsMarked: 2,
        subjectsInClass: 2,
      },
    ]);

    // The family writes and reads.
    const sent = await svc.sendPupilMessage(
      me,
      11,
      'We will bring them tomorrow.',
    );
    expect(sent.messages.map((m: any) => [m.senderKind, m.senderName])).toEqual(
      [
        ['STAFF', 'Mustafe'],
        ['GUARDIAN', 'Cali Xasan'],
      ],
    );
    expect(sent.school).toMatchObject({ branchId: 128 });
    const read = await svc.pupilMessages(me, 11);
    expect(read.thread).toMatchObject({ guardianUnread: 0, staffUnread: 1 });
    expect((await svc.me(me)).schools[0].pupils[1].unreadMessages).toBe(0);
    await expect(svc.pupilMessages(me, 20)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.sendPupilMessage(me, 20, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.sendPupilMessage(me, 11, '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('SchoolGuardianService — the desk’s four buttons', () => {
  it('corrects a username, refusing one another login holds; the internal e-mail follows', async () => {
    const { svc, users } = makeService({
      folios: [folio(10, 128)],
      users: [
        {
          id: 7,
          posUsername: '0911000000',
          email: 'pos.g.0911000000@sys.internal',
          authMode: 'MANUAL',
          password: 'x',
        },
      ],
    });
    const created = await svc.create(
      {
        branchId: 128,
        username: '0915333513',
        password: 'sunny-2019',
        folioIds: [10],
      },
      OFFICE,
    );
    const renamed = await svc.update(created.id, {
      branchId: 128,
      username: '0915333514',
    });
    expect(renamed.username).toBe('0915333514');
    const user = users.find((u) => u.posUsername === '0915333514');
    expect(user.email).toBe('pos.g.0915333514@sys.internal');
    // The same name again is a no-op; another login's is a conflict.
    await expect(
      svc.update(created.id, { branchId: 128, username: '0915333514' }),
    ).resolves.toMatchObject({ username: '0915333514' });
    await expect(
      svc.update(created.id, { branchId: 128, username: '0911000000' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      svc.update(created.id, {
        branchId: 128,
        username: '0911000000'.toUpperCase(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps a withdrawn child linked through an unrelated edit, and only checks the children being ADDED', async () => {
    const rows = [folio(10, 128), folio(11, 128), folio(12, 128)];
    const { svc, pupils } = makeService({ folios: rows });
    const created = await svc.create(
      {
        branchId: 128,
        username: 'cali',
        password: 'sunny-2019',
        folioIds: [10, 11],
      },
      OFFICE,
    );
    // The second child is withdrawn from the roll after the login was made.
    rows[1].status = 'DISCARDED';
    // A phone correction that re-sends the same two children must not be refused over the withdrawn one.
    const edited = await svc.update(created.id, {
      branchId: 128,
      phone: '0900',
      folioIds: [10, 11],
    });
    expect(edited.phone).toBe('0900');
    expect(pupils.map((l) => Number(l.folioId)).sort()).toEqual([10, 11]);
    // Adding the withdrawn child fresh is refused; unticking it drops the link.
    const again = await svc.update(created.id, {
      branchId: 128,
      folioIds: [10],
    });
    expect(again.pupils.map((p: any) => p.folioId)).toEqual([10]);
    await expect(
      svc.update(created.id, { branchId: 128, folioIds: [10, 11] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // A live child is added as before.
    expect(
      (
        await svc.update(created.id, { branchId: 128, folioIds: [10, 12] })
      ).pupils.map((p: any) => p.folioId),
    ).toEqual([10, 12]);
  });

  it('tells a switched-off family that the office switched them off, not that they are no parent', async () => {
    const { svc, guardians } = makeService({ folios: [folio(10, 128)] });
    const created = await svc.create(
      {
        branchId: 128,
        username: 'cali',
        password: 'sunny-2019',
        folioIds: [10],
      },
      OFFICE,
    );
    await svc.update(created.id, { branchId: 128, isActive: false });
    expect(guardians[0].isActive).toBe(false);
    await expect(svc.login('cali', 'sunny-2019')).rejects.toMatchObject({
      response: { error: { code: 'SCHOOL_GUARDIAN_SWITCHED_OFF' } },
    });
    await svc.update(created.id, { branchId: 128, isActive: true });
    await expect(svc.login('cali', 'sunny-2019')).resolves.toMatchObject({
      accessToken: 'at',
    });
  });
});
