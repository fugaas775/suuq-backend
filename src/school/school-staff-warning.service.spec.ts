import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SchoolStaffWarningService } from './school-staff-warning.service';

const TEACHER = { id: 30, branchId: 115, fullName: 'Mustafe', jobTitle: 'Teacher', status: 'ACTIVE', userId: 900 };
const DEPUTY = { id: 2, branchId: 115, fullName: 'Hibo', jobTitle: 'Deputy Director', status: 'ACTIVE', userId: 901 };
const OTHER = { id: 31, branchId: 115, fullName: 'Cabdi', jobTitle: 'Teacher', status: 'ACTIVE', userId: 902 };

function makeService({ warnings = [] as any[], employees = [TEACHER, DEPUTY, OTHER] } = {}) {
  let nextId = 100;
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => Number(row[k]) === Number(v as any) || row[k] === v);
  const repo: any = {
    find: async ({ where }: any) => warnings.filter((r) => matches(r, where)),
    findOne: async ({ where }: any) => warnings.find((r) => matches(r, where)) || null,
    create: (p: any) => ({ ...p }),
    save: async (row: any) => { if (!row.id) { row.id = nextId++; warnings.push(row); } return row; },
  };
  const branchRepo: any = { findOne: async () => ({ id: 115, ownerId: 1 }) };
  const assignmentRepo: any = { findOne: async () => null };
  const employeeRepo: any = {
    find: async ({ where }: any) => employees.filter((e) => e.branchId === where.branchId && e.userId === where.userId),
    findOne: async ({ where }: any) => employees.find((e) => Number(e.id) === Number(where.id) && e.branchId === where.branchId) || null,
  };
  return { svc: new SchoolStaffWarningService(repo, branchRepo, assignmentRepo, employeeRepo), warnings };
}
const AS_TEACHER = { id: 900, email: 'm@x', roles: ['POS_OPERATOR'] };
const AS_DEPUTY = { id: 901, email: 'h@x', roles: ['POS_OPERATOR'] };
const AS_OTHER = { id: 902, email: 'c@x', roles: ['POS_OPERATOR'] };
const AS_OWNER = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };
const WARN = { branchId: 115, employeeId: 30, level: 'VERBAL' as const, category: 'LATENESS' as const, reason: 'Late to P1 four times this month.', expectation: 'Be in class before the bell.', issuedOn: '2026-09-23' };

describe('SchoolStaffWarningService', () => {
  it('lets a head give a warning with the level’s default expiry, names who gave it, and refuses a teacher', async () => {
    const { svc } = makeService();
    const row = await svc.issue(WARN, AS_DEPUTY);
    expect(row).toMatchObject({ employeeId: 30, employeeName: 'Mustafe', level: 'VERBAL', category: 'LATENESS', issuedOn: '2026-09-23', expiresOn: '2027-03-23', issuedByName: 'Hibo', status: 'ACTIVE' });
    const written = await svc.issue({ ...WARN, level: 'WRITTEN', expiresOn: '' }, AS_OWNER);
    expect(written.expiresOn).toBeNull();
    await expect(svc.issue(WARN, AS_OTHER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.issue({ ...WARN, employeeId: 4040 }, AS_DEPUTY)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.issue({ ...WARN, expiresOn: '2026-09-01' }, AS_DEPUTY)).rejects.toBeInstanceOf(ConflictException);
  });

  it('never lets a head warn themselves', async () => {
    const { svc } = makeService();
    await expect(svc.issue({ ...WARN, employeeId: 2 }, AS_DEPUTY)).rejects.toThrow(/yourself/);
  });

  it('reads own warnings with mine=1, everyone’s only as a head, and only the person acknowledges', async () => {
    const { svc } = makeService();
    const row = await svc.issue(WARN, AS_DEPUTY);
    const mine = await svc.list({ branchId: 115, mine: '1' }, AS_TEACHER);
    expect(mine.employee?.id).toBe(30);
    expect(mine.canIssue).toBe(false);
    expect(mine.items).toHaveLength(1);
    await expect(svc.list({ branchId: 115 }, AS_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await svc.list({ branchId: 115 }, AS_DEPUTY)).items).toHaveLength(1);
    await expect(svc.acknowledge(Number(row.id), { branchId: 115 }, AS_OTHER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.acknowledge(Number(row.id), { branchId: 115 }, AS_DEPUTY)).rejects.toBeInstanceOf(ForbiddenException);
    const ack = await svc.acknowledge(Number(row.id), { branchId: 115 }, AS_TEACHER);
    expect(ack.acknowledgedAt).toBeInstanceOf(Date);
    const again = await svc.acknowledge(Number(row.id), { branchId: 115 }, AS_TEACHER);
    expect(again.acknowledgedAt).toBe(ack.acknowledgedAt);
  });

  it('withdraws (heads only, once) and keeps the row on file; the summary reads the ladder', async () => {
    const { svc, warnings } = makeService();
    const a = await svc.issue(WARN, AS_DEPUTY);
    const b = await svc.issue({ ...WARN, level: 'WRITTEN', category: 'ABSENCE' }, AS_DEPUTY);
    await expect(svc.withdraw(Number(a.id), { branchId: 115 }, AS_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    const gone = await svc.withdraw(Number(b.id), { branchId: 115, note: 'Absence was approved leave after all' }, AS_OWNER);
    expect(gone).toMatchObject({ status: 'WITHDRAWN', withdrawNote: 'Absence was approved leave after all' });
    await expect(svc.withdraw(Number(b.id), { branchId: 115 }, AS_OWNER)).rejects.toBeInstanceOf(ConflictException);
    expect(warnings).toHaveLength(2);
    await expect(svc.summary(115, AS_TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    const board = await svc.summary(115, AS_DEPUTY);
    expect(board.people).toEqual([
      expect.objectContaining({ employeeId: 30, active: 1, highest: 'VERBAL', nextStep: 'WRITTEN', withdrawn: 1, unacknowledged: 1 }),
    ]);
  });
});
