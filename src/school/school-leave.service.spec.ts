import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SchoolLeaveService } from './school-leave.service';

/* Staff leave: a person's own request; the heads decide, never their own. */
const TEACHER = { id: 30, branchId: 115, fullName: 'Mustafe', jobTitle: 'Teacher', status: 'ACTIVE', userId: 900 };
const DEPUTY = { id: 2, branchId: 115, fullName: 'Hibo', jobTitle: 'Deputy Director', status: 'ACTIVE', userId: 901 };
const OTHER = { id: 31, branchId: 115, fullName: 'Cabdi', jobTitle: 'Teacher', status: 'ACTIVE', userId: 902 };
const CLEANER = { id: 40, branchId: 115, fullName: 'Faadumo', jobTitle: 'Cleaner', status: 'ACTIVE', userId: null };

const inValues = (v: any) => (v && typeof v === 'object' && '_value' in v ? v._value : v && typeof v === 'object' && 'value' in v ? v.value : v);
const opMatch = (op: any, actual: string) => {
  if (op == null) return true;
  if (typeof op === 'string') return op === actual;
  const type = op._type ?? op.type;
  const value = inValues(op);
  if (type === 'lessThanOrEqual') return actual <= value;
  if (type === 'moreThanOrEqual') return actual >= value;
  if (type === 'in') return (value as string[]).includes(actual);
  return true;
};

function makeService({ leaves = [] as any[], employees = [TEACHER, DEPUTY, OTHER, CLEANER], ownerId = 1, assignments = [] as any[], periods = null as any, country = null as string | null } = {}) {
  let nextId = 100;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'startDate' || k === 'endDate' || k === 'status') return opMatch(v, row[k]);
      return Number(row[k]) === Number(v as any) || row[k] === v;
    });
  const leaveRepo: any = {
    find: async ({ where }: any) => leaves.filter((r) => matches(r, where)),
    findOne: async ({ where }: any) => leaves.find((r) => matches(r, where)) || null,
    create: (p: any) => ({ ...p }),
    save: async (row: any) => {
      if (!row.id) { row.id = nextId++; leaves.push(row); }
      return row;
    },
  };
  const branchRepo: any = { findOne: async () => ({ id: 115, ownerId, country }) };
  const assignmentRepo: any = {
    findOne: async ({ where }: any) => assignments.find((a) => a.userId === where.userId) || null,
  };
  const employeeRepo: any = {
    find: async ({ where }: any) => employees.filter((e) => e.branchId === where.branchId && e.userId === where.userId),
    findOne: async ({ where }: any) => employees.find((e) => Number(e.id) === Number(where.id) && e.branchId === where.branchId) || null,
  };
  const timetable: any = { get: async () => ({ periods: periods ?? [] }) };
  return { svc: new SchoolLeaveService(leaveRepo, branchRepo, assignmentRepo, employeeRepo, timetable), leaves };
}

const AS_TEACHER = { id: 900, email: 'm@x', roles: ['POS_OPERATOR'] };
const AS_DEPUTY = { id: 901, email: 'h@x', roles: ['POS_OPERATOR'] };
const AS_OTHER = { id: 902, email: 'c@x', roles: ['POS_OPERATOR'] };
const AS_OWNER = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };
const AS_NOBODY = { id: 999, email: 'n@x', roles: ['POS_OPERATOR'] };
const REQUEST = { branchId: 115, leaveType: 'SICK' as const, startDate: '2026-09-23', endDate: '2026-09-25', reason: 'Flu' };

describe('SchoolLeaveService', () => {
  it('files a teacher’s own request as PENDING with the school days counted, and refuses a login with no staff row', async () => {
    const { svc } = makeService();
    const row = await svc.create(REQUEST, AS_TEACHER);
    expect(row).toMatchObject({ employeeId: 30, employeeName: 'Mustafe', status: 'PENDING', schoolDays: 3, leaveType: 'SICK', requestedByName: 'Mustafe' });
    const { svc: nobody } = makeService();
    await expect(nobody.create(REQUEST, AS_NOBODY)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a request whose days a pending or approved one already covers, and one that holds no school day', async () => {
    const { svc } = makeService();
    await svc.create(REQUEST, AS_TEACHER);
    await expect(svc.create({ ...REQUEST, startDate: '2026-09-25', endDate: '2026-09-28' }, AS_TEACHER)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.create({ ...REQUEST, startDate: '2026-09-25', endDate: '2026-09-28' }, AS_TEACHER)).rejects.toThrow(/pending leave from 2026-09-23 to 2026-09-25/);
    // The following week is free.
    await expect(svc.create({ ...REQUEST, startDate: '2026-09-28', endDate: '2026-09-29' }, AS_TEACHER)).resolves.toMatchObject({ schoolDays: 2 });
    // A weekend holds no school day.
    await expect(svc.create({ ...REQUEST, startDate: '2026-10-03', endDate: '2026-10-04' }, AS_TEACHER)).rejects.toThrow(/No school day/);
    await expect(svc.create({ ...REQUEST, startDate: '2026-10-05', endDate: '2026-10-01' }, AS_TEACHER)).rejects.toThrow(/before the first/);
  });

  it('counts school days off the timetable’s bell', async () => {
    const { svc } = makeService({ periods: [{ code: 'P1', kind: 'LESSON', days: [1, 2, 3, 4, 5, 6] }] });
    const row = await svc.create({ ...REQUEST, startDate: '2026-09-21', endDate: '2026-09-27' }, AS_TEACHER);
    expect(row.schoolDays).toBe(6);
  });

  it('lets a head approve or reject a pending request — never their own, never twice', async () => {
    const { svc, leaves } = makeService();
    const row = await svc.create(REQUEST, AS_TEACHER);
    // A teacher is not a head.
    await expect(svc.decide(Number(row.id), { branchId: 115, decision: 'APPROVED' }, AS_OTHER)).rejects.toBeInstanceOf(ForbiddenException);
    const ok = await svc.decide(Number(row.id), { branchId: 115, decision: 'APPROVED', note: 'Get well', coverNote: 'Cabdi takes 3aad' }, AS_DEPUTY);
    expect(ok).toMatchObject({ status: 'APPROVED', decidedByName: 'Hibo', decisionNote: 'Get well', coverNote: 'Cabdi takes 3aad' });
    expect(ok.decidedAt).toBeInstanceOf(Date);
    await expect(svc.decide(Number(row.id), { branchId: 115, decision: 'REJECTED' }, AS_DEPUTY)).rejects.toBeInstanceOf(ConflictException);
    // The deputy's own request is somebody else's decision.
    const own = await svc.create({ ...REQUEST, leaveType: 'ANNUAL' }, AS_DEPUTY);
    expect(own.status).toBe('PENDING');
    await expect(svc.decide(Number(own.id), { branchId: 115, decision: 'APPROVED' }, AS_DEPUTY)).rejects.toThrow(/Your own leave/);
    const byOwner = await svc.decide(Number(own.id), { branchId: 115, decision: 'REJECTED', note: 'Exams week' }, AS_OWNER);
    expect(byOwner).toMatchObject({ status: 'REJECTED', decisionNote: 'Exams week' });
    expect(leaves).toHaveLength(2);
    await expect(svc.decide(555, { branchId: 115, decision: 'APPROVED' }, AS_OWNER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records leave for somebody else as APPROVED at once — heads only, and the person must be on the staff list', async () => {
    const { svc } = makeService();
    const row = await svc.create({ ...REQUEST, employeeId: 40 }, AS_DEPUTY);
    expect(row).toMatchObject({ employeeId: 40, employeeName: 'Faadumo', status: 'APPROVED', decidedByName: 'Hibo', decisionNote: 'Recorded by the office', requestedByName: 'Hibo' });
    await expect(svc.create({ ...REQUEST, employeeId: 40, startDate: '2026-10-05', endDate: '2026-10-06' }, AS_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.create({ ...REQUEST, employeeId: 4040 }, AS_DEPUTY)).rejects.toBeInstanceOf(NotFoundException);
    // Naming one's own row is an ordinary request.
    const own = await svc.create({ ...REQUEST, employeeId: 30 }, AS_TEACHER);
    expect(own.status).toBe('PENDING');
  });

  it('reads own requests with mine=1 (and whether one may approve), everyone’s only as a head, by day and by status', async () => {
    const { svc } = makeService();
    await svc.create(REQUEST, AS_TEACHER);
    await svc.create({ ...REQUEST, employeeId: 40 }, AS_DEPUTY);
    const mine = await svc.list({ branchId: 115, mine: '1' }, AS_TEACHER);
    expect(mine.employee?.id).toBe(30);
    expect(mine.canApprove).toBe(false);
    expect(mine.items).toHaveLength(1);
    // Where the person stands against this year's allowance rides along.
    expect(mine.allowance).toMatchObject({ rate: 0.1, approvedDays: 0, pendingDays: 0 });
    expect(mine.allowance.allowanceDays).toBe(Math.floor(mine.allowance.yearDays / 10));
    const deputyMine = await svc.list({ branchId: 115, mine: '1' }, AS_DEPUTY);
    expect(deputyMine.canApprove).toBe(true);
    expect(deputyMine.items).toHaveLength(0);
    await expect(svc.list({ branchId: 115 }, AS_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    const all = await svc.list({ branchId: 115 }, AS_DEPUTY);
    expect(all.items).toHaveLength(2);
    const pending = await svc.list({ branchId: 115, status: 'PENDING' }, AS_OWNER);
    expect(pending.items.map((r) => r.employeeId)).toEqual([30]);
    const onDay = await svc.list({ branchId: 115, on: '2026-09-24', status: 'APPROVED' }, AS_OWNER);
    expect(onDay.items.map((r) => r.employeeId)).toEqual([40]);
    expect((await svc.list({ branchId: 115, on: '2026-09-30' }, AS_OWNER)).items).toHaveLength(0);
    const none = await svc.list({ branchId: 115, mine: '1' }, AS_NOBODY);
    expect(none).toEqual({ employee: null, canApprove: false, items: [] });
  });

  it('lets the person withdraw a pending request, keeps begun leave for the office, and lets a head cancel any that stands', async () => {
    const { svc } = makeService();
    const row = await svc.create(REQUEST, AS_TEACHER);
    await expect(svc.cancel(Number(row.id), { branchId: 115 }, AS_OTHER)).rejects.toBeInstanceOf(ForbiddenException);
    const gone = await svc.cancel(Number(row.id), { branchId: 115, note: 'Better now' }, AS_TEACHER);
    expect(gone).toMatchObject({ status: 'CANCELLED', cancelledByName: 'Mustafe', cancelNote: 'Better now' });
    await expect(svc.cancel(Number(row.id), { branchId: 115 }, AS_TEACHER)).rejects.toBeInstanceOf(ConflictException);
    // Approved and already begun: not the person's to withdraw.
    const begun = await svc.create({ ...REQUEST, startDate: '2020-01-06', endDate: '2020-01-07' }, AS_TEACHER);
    await svc.decide(Number(begun.id), { branchId: 115, decision: 'APPROVED' }, AS_DEPUTY);
    await expect(svc.cancel(Number(begun.id), { branchId: 115 }, AS_TEACHER)).rejects.toThrow(/has begun/);
    const closed = await svc.cancel(Number(begun.id), { branchId: 115 }, AS_DEPUTY);
    expect(closed.status).toBe('CANCELLED');
  });

  it('sums approved school days per person over a window, by type, with pending counted apart', async () => {
    const { svc } = makeService();
    const a = await svc.create(REQUEST, AS_TEACHER);
    await svc.decide(Number(a.id), { branchId: 115, decision: 'APPROVED' }, AS_DEPUTY);
    await svc.create({ ...REQUEST, leaveType: 'ANNUAL', startDate: '2026-10-05', endDate: '2026-10-09' }, AS_TEACHER);
    await svc.create({ ...REQUEST, employeeId: 40, leaveType: 'ANNUAL', startDate: '2026-10-12', endDate: '2026-10-13' }, AS_DEPUTY);
    await expect(svc.summary(115, '2026-09-01', '2026-12-31', AS_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    const board = await svc.summary(115, '2026-09-01', '2026-12-31', AS_DEPUTY);
    expect(board.people).toEqual([
      { employeeId: 40, employeeName: 'Faadumo', approvedDays: 2, approved: 1, pending: 0, byType: { ANNUAL: 2 }, countedDays: 2, pendingCountedDays: 0 },
      // Sick leave is approved but draws nothing; the pending annual week is spoken for.
      { employeeId: 30, employeeName: 'Mustafe', approvedDays: 3, approved: 1, pending: 1, byType: { SICK: 3 }, countedDays: 0, pendingCountedDays: 5 },
    ]);
    // What the window allows: a tenth of its school days (88 weekdays, Sept to Dec 2026).
    expect(board.allowance).toEqual({ rate: 0.1, yearDays: 88, days: 8, kinds: ['ANNUAL', 'PERSONAL', 'STUDY', 'UNPAID', 'OTHER'] });
  });

  /* Owner 2026-10-06: "Teachers should only have a 10% annual leave, if it
     is more than it should not be tolerated." 2026/2027 holds 261 school
     days Monday to Friday, so the allowance is 26. */
  it('refuses leave past a tenth of the year’s school days — asked for, recorded by the office, or approved — and leaves sick leave outside it', async () => {
    const { svc } = makeService();
    // The office records four weeks of annual leave for the cleaner: 20 of 26.
    await expect(svc.create({ branchId: 115, employeeId: 40, leaveType: 'ANNUAL', startDate: '2026-10-05', endDate: '2026-10-30' }, AS_DEPUTY)).resolves.toMatchObject({ schoolDays: 20, status: 'APPROVED' });
    // Seven more would make 27: refused, with the figures.
    const seven = svc.create({ branchId: 115, employeeId: 40, leaveType: 'ANNUAL', startDate: '2026-11-02', endDate: '2026-11-10' }, AS_DEPUTY);
    await expect(seven).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(seven).rejects.toThrow(/Faadumo has 20 school days of leave approved of the 26 allowed for 2026\/2027; these 7 school days would make 27/);
    await expect(seven).rejects.toMatchObject({ response: { code: 'SCHOOL_LEAVE_OVER_ALLOWANCE', details: { allowanceDays: 26, approvedDays: 20, requestedDays: 7, total: 27, yearDays: 261 } } });
    // Six fit exactly.
    await expect(svc.create({ branchId: 115, employeeId: 40, leaveType: 'ANNUAL', startDate: '2026-11-02', endDate: '2026-11-09' }, AS_DEPUTY)).resolves.toMatchObject({ schoolDays: 6 });
    // Sick leave is outside the allowance; a personal day is not.
    await expect(svc.create({ branchId: 115, employeeId: 40, leaveType: 'SICK', startDate: '2026-12-01', endDate: '2026-12-04' }, AS_DEPUTY)).resolves.toMatchObject({ schoolDays: 4 });
    await expect(svc.create({ branchId: 115, employeeId: 40, leaveType: 'PERSONAL', startDate: '2026-12-07', endDate: '2026-12-07' }, AS_DEPUTY)).rejects.toThrow(/these 1 school day would make 27/);
    // Next school year starts afresh.
    await expect(svc.create({ branchId: 115, employeeId: 40, leaveType: 'ANNUAL', startDate: '2027-09-06', endDate: '2027-09-10' }, AS_DEPUTY)).resolves.toMatchObject({ schoolDays: 5 });

    // The teacher asks: a pending request is spoken for too.
    const asked = await svc.create({ branchId: 115, leaveType: 'ANNUAL', startDate: '2026-10-05', endDate: '2026-11-06' }, AS_TEACHER);
    expect(asked).toMatchObject({ schoolDays: 25, status: 'PENDING' });
    await expect(svc.create({ branchId: 115, leaveType: 'PERSONAL', startDate: '2026-11-09', endDate: '2026-11-10' }, AS_TEACHER)).rejects.toThrow(/Mustafe has 0 school days of leave approved and 25 school days awaiting decision of the 26 allowed/);
    await expect(svc.create({ branchId: 115, leaveType: 'PERSONAL', startDate: '2026-11-09', endDate: '2026-11-09' }, AS_TEACHER)).resolves.toMatchObject({ schoolDays: 1 });
    const mine = await svc.list({ branchId: 115, mine: '1' }, AS_TEACHER);
    expect(mine.allowance).toMatchObject({ yearDays: 261, allowanceDays: 26, approvedDays: 0, pendingDays: 26, leftDays: 0 });
    await svc.decide(Number(asked.id), { branchId: 115, decision: 'APPROVED' }, AS_DEPUTY);
    expect((await svc.list({ branchId: 115, mine: '1' }, AS_TEACHER)).allowance).toMatchObject({ approvedDays: 25, pendingDays: 1, leftDays: 0 });
  });

  it('refuses an approval that would go past the allowance — a request filed before the rule — and still lets it be rejected', async () => {
    const { svc } = makeService({ leaves: [
      { id: 1, branchId: 115, employeeId: 30, employeeName: 'Mustafe', leaveType: 'ANNUAL', startDate: '2026-10-05', endDate: '2026-11-06', schoolDays: 25, status: 'APPROVED' },
      { id: 2, branchId: 115, employeeId: 30, employeeName: 'Mustafe', leaveType: 'STUDY', startDate: '2026-11-09', endDate: '2026-11-10', schoolDays: 2, status: 'PENDING' },
      { id: 3, branchId: 115, employeeId: 30, employeeName: 'Mustafe', leaveType: 'SICK', startDate: '2026-11-16', endDate: '2026-11-20', schoolDays: 5, status: 'PENDING' },
    ] });
    const over = svc.decide(2, { branchId: 115, decision: 'APPROVED' }, AS_DEPUTY);
    await expect(over).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(over).rejects.toThrow(/Mustafe has 25 school days of leave approved of the 26 allowed for 2026\/2027; these 2 school days would make 27/);
    // Sick leave is approved regardless; the study days can still be rejected.
    await expect(svc.decide(3, { branchId: 115, decision: 'APPROVED' }, AS_DEPUTY)).resolves.toMatchObject({ status: 'APPROVED' });
    await expect(svc.decide(2, { branchId: 115, decision: 'REJECTED', note: 'Over the allowance' }, AS_DEPUTY)).resolves.toMatchObject({ status: 'REJECTED' });
  });

  it('counts an Ethiopian school’s year from Meskerem 1, and a request over the New Year against each year it touches', async () => {
    const { svc } = makeService({ country: 'Ethiopia' });
    // 2019 E.C.: 2026-09-11 to 2027-09-11, 261 school days, allowance 26.
    const mine = await svc.list({ branchId: 115, mine: '1' }, AS_TEACHER);
    expect(mine.allowance).toMatchObject({ year: { from: '2026-09-11', to: '2027-09-11', label: '2019 E.C.' }, yearDays: 261, allowanceDays: 26 });
    await svc.create({ branchId: 115, employeeId: 40, leaveType: 'ANNUAL', startDate: '2026-10-05', endDate: '2026-11-06' }, AS_DEPUTY); // 25
    // Monday 2027-09-06 to Friday 2027-09-17: five days in 2019 E.C. (one left) and five in 2020 E.C. (26 free).
    const straddle = svc.create({ branchId: 115, employeeId: 40, leaveType: 'ANNUAL', startDate: '2027-09-06', endDate: '2027-09-17' }, AS_DEPUTY);
    await expect(straddle).rejects.toThrow(/of the 26 allowed for 2019 E\.C\.; these 5 school days would make 30/);
    await expect(svc.create({ branchId: 115, employeeId: 40, leaveType: 'ANNUAL', startDate: '2027-09-10', endDate: '2027-09-17', }, AS_DEPUTY)).resolves.toMatchObject({ schoolDays: 6 });
  });
});
