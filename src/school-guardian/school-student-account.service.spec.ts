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
import { SchoolStudentAccountService } from './school-student-account.service';
import { memRepo, qb, reachStub } from './test/memory-repo';

/* Pupils' own logins: the office hands a pupil a username; the pupil then
   reads their own record and nobody else's. */

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
const OTHER_SCHOOL = { ...SCHOOL, id: 115, name: 'SMAQ School' };
const SHOP = { ...SCHOOL, id: 7, name: 'A shop', serviceFormat: 'RETAIL' };

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
  accounts = [] as any[],
  checkouts = [] as any[],
  loans = [] as any[],
  classes = [] as any[],
  employees = [] as any[],
  slots = [] as any[],
  notices = [] as any[],
  homeworkRows = [] as any[],
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
  const accountRepo = memRepo(accounts, seq);
  const byName: Record<string, any> = {
    User: userRepo,
    SchoolStudentAccount: accountRepo,
  };
  accountRepo.byEntity = (entity: any) => byName[entity.name];
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
  const branchRepo = memRepo([SCHOOL, OTHER_SCHOOL, SHOP] as any[], seq);
  const classRepo = memRepo(classes, seq);
  classRepo.createQueryBuilder = () =>
    qb(
      classes,
      (r, p) =>
        Number(r.branchId) === Number(p.branchId) &&
        String(r.code).toLowerCase() === p.code,
    );
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
                recordedByName: 'Mustafe',
              },
              {
                attendanceDate: '2026-09-14',
                subjectRef: '99',
                status: 'ABSENT',
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
  const homeworkRepo = memRepo(homeworkRows, seq);
  homeworkRepo.createQueryBuilder = () =>
    qb(homeworkRows, (r, p) => Number(r.branchId) === Number(p.branchId));
  const reach = reachStub(() => ({
    head: true,
    employee: { id: 30, fullName: 'Mustafe' },
    name: 'Mustafe',
  }));
  const homework = new SchoolHomeworkService(homeworkRepo, reach);
  const guardianRepo = memRepo([], seq);
  const pupilRepo = memRepo([], seq);
  const messages = new SchoolMessageService(
    memRepo([], seq),
    memRepo([], seq),
    guardianRepo,
    pupilRepo,
    cartRepo,
    userRepo,
    reach,
  );
  const guardians = new SchoolGuardianService(
    guardianRepo,
    pupilRepo,
    cartRepo,
    checkoutRepo,
    branchRepo,
    userRepo,
    classRepo,
    memRepo(employees, seq),
    memRepo(loans, seq),
    memRepo(notices, seq),
    attendance,
    timetable,
    auth,
    homework,
    messages,
    new SchoolStatementCodeService(memRepo([], seq)),
  );
  const svc = new SchoolStudentAccountService(
    accountRepo,
    cartRepo,
    branchRepo,
    userRepo,
    attendance,
    auth,
    homework,
    guardians,
  );
  return { svc, users, accounts, attendance, homeworkRows, notices };
}

const OFFICE = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };

describe('SchoolStudentAccountService — the office', () => {
  it('creates a login for one pupil, refuses a second for the same pupil, another school’s pupil, a taken username and a non-school branch', async () => {
    const { svc, users, accounts } = makeService({
      folios: [folio(10, 128), folio(12, 115)],
      users: [{ id: 7, posUsername: 'taken', password: 'x' }],
    });
    const view = await svc.create(
      {
        branchId: 128,
        folioId: 10,
        username: 'SMAG-10',
        password: 'sunny-2019',
      },
      OFFICE,
    );
    expect(view).toMatchObject({
      folioId: 10,
      username: 'smag-10',
      displayName: 'Pupil 10',
      isActive: true,
    });
    expect(view.pupil).toMatchObject({
      name: 'Pupil 10',
      classCode: '3aad',
      status: 'ACTIVE',
      money: { total: 2500, outstanding: 2500 },
    });
    const user = users.find((u) => u.posUsername === 'smag-10');
    expect(user).toMatchObject({
      authMode: 'MANUAL',
      roles: [],
      email: 'pos.s.smag-10@sys.internal',
    });
    expect(await bcrypt.compare('sunny-2019', user.password)).toBe(true);
    expect(accounts).toHaveLength(1);

    // One pupil, one login.
    await expect(
      svc.create(
        {
          branchId: 128,
          folioId: 10,
          username: 'again',
          password: 'sunny-2019',
        },
        OFFICE,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    // Not this school's pupil.
    await expect(
      svc.create(
        {
          branchId: 128,
          folioId: 12,
          username: 'other',
          password: 'sunny-2019',
        },
        OFFICE,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Username held by somebody (a parent, staff, anyone).
    await expect(
      svc.create(
        {
          branchId: 115,
          folioId: 12,
          username: 'taken',
          password: 'sunny-2019',
        },
        OFFICE,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    // Not a school.
    await expect(
      svc.create(
        { branchId: 7, folioId: 12, username: 'x1234', password: 'sunny-2019' },
        OFFICE,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('suggests the admission number as the username (the name when there is none), never one taken, and skips leavers and pupils with a login', async () => {
    const { svc } = makeService({
      folios: [
        folio(10, 128),
        folio(11, 128, { schoolAdmissionNo: '', hotelGuestName: 'Hodan Nuur' }),
        folio(13, 128, {
          schoolAdmissionNo: 'SMAG-13',
          hotelRoomNumber: '1aad',
        }),
        folio(15, 128, { schoolStatus: 'INACTIVE' }),
      ],
      users: [{ id: 7, posUsername: 'smag-13', password: 'x' }],
    });
    const out = await svc.suggestions(128);
    expect(out.pupilsWithoutLogin).toBe(3);
    const byFolio = Object.fromEntries(
      out.items.map((p: any) => [p.folioId, p.suggestedUsername]),
    );
    expect(byFolio[10]).toBe('smag-10');
    expect(byFolio[11]).toBe('hodan.nuur');
    expect(byFolio[13]).toBe('smag-13.2');
    // Sorted by class then name.
    expect(out.items[0].folioId).toBe(13);

    await svc.create(
      {
        branchId: 128,
        folioId: 10,
        username: 'smag-10',
        password: 'sunny-2019',
      },
      OFFICE,
    );
    expect((await svc.suggestions(128)).pupilsWithoutLogin).toBe(2);
    // Switched off still counts as "has a login".
    const made = (await svc.list(128)).items[0];
    await svc.update(made.id, { branchId: 128, isActive: false });
    expect((await svc.suggestions(128)).pupilsWithoutLogin).toBe(2);
  });

  it('creates logins for a whole list at once — usernames picked and de-duplicated, a random or a common password — and reports who was skipped', async () => {
    const { svc, users } = makeService({
      folios: [
        folio(10, 128),
        folio(11, 128, { schoolAdmissionNo: 'SMAG-10' }), // same admission no. typed twice
        folio(12, 115),
        folio(14, 128, { schoolAdmissionNo: '', hotelGuestName: 'Al' }),
        folio(15, 128, { schoolStatus: 'INACTIVE' }),
      ],
    });
    const out = await svc.createMany(
      { branchId: 128, folioIds: [10, 11, 12, 14, 15, 10] },
      OFFICE,
    );
    expect(out.createdCount).toBe(3);
    expect(out.created.map((c) => [c.folioId, c.username])).toEqual([
      [10, 'smag-10'],
      [11, 'smag-10.2'],
      [15, 'smag-15'],
    ]);
    for (const c of out.created) {
      expect(c.password).toMatch(/^[a-z2-9]{8}$/);
      const user = users.find((u) => u.posUsername === c.username);
      expect(await bcrypt.compare(c.password, user.password)).toBe(true);
    }
    expect(out.skipped).toEqual([
      { folioId: 12, name: '', reason: 'NOT_A_PUPIL' },
      { folioId: 14, name: 'Al', reason: 'NO_USERNAME' },
    ]);

    // A second run: the ones made are skipped as HAS_LOGIN; a common password is used as given.
    const again = await svc.createMany(
      { branchId: 128, folioIds: [10, 11], password: 'school-2019' },
      OFFICE,
    );
    expect(again.createdCount).toBe(0);
    expect(again.skipped.map((s) => s.reason)).toEqual([
      'HAS_LOGIN',
      'HAS_LOGIN',
    ]);
  });

  it('renames a login (refusing a taken name), switches it off and on, resets the password, and removes it freeing the username', async () => {
    const { svc, users, accounts } = makeService({
      folios: [folio(10, 128)],
      users: [{ id: 7, posUsername: 'held', password: 'x' }],
    });
    const made = await svc.create(
      {
        branchId: 128,
        folioId: 10,
        username: 'smag-10',
        password: 'sunny-2019',
      },
      OFFICE,
    );
    await expect(
      svc.update(made.id, { branchId: 128, username: 'held' }),
    ).rejects.toBeInstanceOf(ConflictException);
    const renamed = await svc.update(made.id, {
      branchId: 128,
      username: 'Pupil.Ten',
      displayName: 'Pupil Ten',
      isActive: false,
    });
    expect(renamed).toMatchObject({
      username: 'pupil.ten',
      displayName: 'Pupil Ten',
      isActive: false,
    });
    const user = users.find((u) => u.posUsername === 'pupil.ten');
    expect(user.email).toBe('pos.s.pupil.ten@sys.internal');

    await svc.resetPassword(made.id, { branchId: 128, password: 'new-pass-1' });
    expect(await bcrypt.compare('new-pass-1', user.password)).toBe(true);
    expect(accounts[0].passwordIssuedAt).toBeInstanceOf(Date);

    await expect(svc.update(made.id, { branchId: 115 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const gone = await svc.remove(made.id, 128);
    expect(gone).toMatchObject({ status: 'REMOVED', userRemoved: true });
    expect(users.map((u) => u.posUsername)).toEqual(['held']);
    expect(accounts).toHaveLength(0);
  });
});

describe('SchoolStudentAccountService — the pupil', () => {
  async function pupil() {
    const made = makeService({
      folios: [
        folio(10, 128, {
          paid: true,
          schoolAcademicRecord: {
            reports: [
              {
                term: '2019-S1',
                position: '',
                subjects: [{ subject: 'Maths', total: 45, outOf: 50 }],
              },
            ],
          },
        }),
        folio(99, 128, {
          hotelGuestName: 'Somebody Else',
          schoolAcademicRecord: {
            reports: [
              {
                term: '2019-S1',
                position: '',
                subjects: [{ subject: 'Maths', total: 25, outOf: 50 }],
              },
            ],
          },
        }),
        folio(12, 115),
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
        { id: 30, branchId: 128, fullName: 'Mustafe', jobTitle: 'Teacher' },
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
      notices: [
        {
          id: 1,
          branchId: 128,
          title: 'Exam week',
          body: 'Bring pencils.',
          audience: 'CLASSES',
          classCodes: ['3aad'],
          publishedAt: new Date('2026-09-20'),
          expiresAt: null,
          isActive: true,
        },
        {
          id: 2,
          branchId: 128,
          title: 'Grade 4 trip',
          body: 'Bus at 8.',
          audience: 'CLASSES',
          classCodes: ['4aad'],
          publishedAt: new Date('2026-09-20'),
          expiresAt: null,
          isActive: true,
        },
        {
          id: 3,
          branchId: 128,
          title: 'Holiday',
          body: 'Closed Monday.',
          audience: 'ALL',
          classCodes: null,
          publishedAt: new Date('2026-09-21'),
          expiresAt: null,
          isActive: true,
        },
      ],
    });
    await made.svc.create(
      {
        branchId: 128,
        folioId: 10,
        username: 'smag-10',
        password: 'sunny-2019',
      },
      OFFICE,
    );
    return made;
  }

  it('signs a pupil in and lists their school and record; a staff or parent login with no student account is refused; a switched-off one is told so', async () => {
    const { svc, users, accounts, attendance } = await pupil();
    attendance.today = [
      {
        attendanceDate: new Date().toISOString().slice(0, 10),
        subjectRef: '10',
        status: 'LATE',
        note: null,
      },
    ];
    const out = await svc.login('SMAG-10', 'sunny-2019');
    expect(out).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
    expect(out.user).toMatchObject({
      username: 'smag-10',
      displayName: 'Pupil 10',
      canChangePassword: true,
      usingIssuedPassword: true,
    });
    expect(out.schools).toHaveLength(1);
    expect(out.schools[0]).toMatchObject({
      branchId: 128,
      name: 'SMAG School',
    });
    expect(out.schools[0].pupil).toMatchObject({
      folioId: 10,
      name: 'Pupil 10',
      classCode: '3aad',
      status: 'ACTIVE',
      money: { total: 2500, paidTotal: 2500, outstanding: 0 },
      todayMark: { status: 'LATE', note: null },
      homeworkDue: 0,
    });
    // Only the notices that reach a 3aad pupil: the class's and the school's.
    expect(out.notices.map((n: any) => n.id)).toEqual([3, 1]);
    expect(accounts[0].lastLoginAt).toBeInstanceOf(Date);

    await expect(svc.login('smag-10', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(svc.login('x@y.z', 'sunny-2019')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    users.push({
      id: 500,
      posUsername: 'teacher',
      password: await bcrypt.hash('pw-123456', 4),
      authMode: 'MANUAL',
    });
    await expect(svc.login('teacher', 'pw-123456')).rejects.toMatchObject({
      response: { error: { code: 'SCHOOL_STUDENT_ACCESS_DENIED' } },
    });
    accounts[0].isActive = false;
    await expect(svc.login('smag-10', 'sunny-2019')).rejects.toMatchObject({
      response: { error: { code: 'SCHOOL_STUDENT_SWITCHED_OFF' } },
    });
  });

  it('reads the pupil’s own record in full — receipts without the cashier, the register without who took it, books, the class week, teacher, place in class — and only their own', async () => {
    const { svc } = await pupil();
    const me = await svc.login('smag-10', 'sunny-2019');
    const userId = Number(me.user.id);
    const page = await svc.pupil(userId, 10);
    expect(page.pupil).toMatchObject({
      name: 'Pupil 10',
      className: 'Grade 3',
      money: { outstanding: 0 },
    });
    expect(page.classTeacher).toEqual({
      fullName: 'Mustafe',
      jobTitle: 'Teacher',
    });
    expect(page.receipts.map((r: any) => r.receiptNumber)).toEqual([
      'POS-128-1',
    ]);
    expect(page.receipts[0]).not.toHaveProperty('cashierName');
    expect(page.attendance.days).toEqual([
      { attendanceDate: '2026-09-14', subjectRef: '10', status: 'PRESENT' },
    ]);
    expect(page.textbooks.map((b: any) => b.title)).toEqual(['Maths']);
    expect(page.timetable.slots.map((s: any) => s.subject)).toEqual(['Maths']);
    expect(page.rank).toEqual([
      expect.objectContaining({
        term: '2019-S1',
        position: 1,
        of: 2,
        complete: true,
      }),
    ]);
    // The family's conversation is not on the pupil's page.
    expect(page).not.toHaveProperty('unreadMessages');
    expect(page).not.toHaveProperty('guardian');
    // Not another pupil, not even one at the same school.
    await expect(svc.pupil(userId, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.pupil(userId, 12)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets a pupil change their own password with the current one; a wrong current password is a 400, not a 401', async () => {
    const { svc, users, accounts } = await pupil();
    const me = await svc.login('smag-10', 'sunny-2019');
    const userId = Number(me.user.id);
    await expect(
      svc.changePassword(userId, {
        currentPassword: 'nope',
        newPassword: 'fresh-2019',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await svc.changePassword(userId, {
      currentPassword: 'sunny-2019',
      newPassword: 'fresh-2019',
    });
    const user = users.find((u) => u.posUsername === 'smag-10');
    expect(await bcrypt.compare('fresh-2019', user.password)).toBe(true);
    expect(accounts[0].passwordChangedAt).toBeInstanceOf(Date);
    expect((await svc.me(userId)).user.usingIssuedPassword).toBe(false);
    // A reset by the office puts the nudge back.
    await svc.resetPassword(accounts[0].id, {
      branchId: 128,
      password: 'office-2020',
    });
    expect((await svc.me(userId)).user.usingIssuedPassword).toBe(true);
    await expect(
      svc.changePassword(999, {
        currentPassword: 'x',
        newPassword: 'fresh-2019',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
