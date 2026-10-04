import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SchoolHomeworkService } from './school-homework.service';
import { memRepo, qb, reachStub } from './test/memory-repo';

/* Homework: a teacher sets it for the classes they reach; the families of
   that class read it; the heads set and take down anything. */

const TEACHER = { id: 30, email: 't@x', roles: ['POS_OPERATOR'] };
const OTHER = { id: 31, email: 'u@x', roles: ['POS_OPERATOR'] };
const HEAD = { id: 1, email: 'o@x', roles: ['POS_MANAGER'] };

function make(rows: any[] = []) {
  const repo = memRepo(rows);
  repo.createQueryBuilder = () =>
    qb(rows, (r, p) => {
      if (Number(r.branchId) !== Number(p.branchId)) return false;
      if (p.since && new Date(r.createdAt).toISOString() < p.since)
        return false;
      if (p.code && r.classCode !== p.code) return false;
      if (p.codes && !p.codes.includes(r.classCode)) return false;
      if (p.emp != null && Number(r.employeeId) !== Number(p.emp)) return false;
      if (p.active !== undefined && r.isActive === false) return false;
      return true;
    });
  const reach = reachStub((actor) => {
    if (actor.id === 30)
      return {
        head: false,
        classes: ['3aad', '4aad'],
        assigned: ['3aad'],
        pairs: ['4aad|maths', '3aad|maths'],
        employee: { id: 30, fullName: 'Mustafe' },
      };
    if (actor.id === 31)
      return {
        head: false,
        classes: ['5aad'],
        assigned: [],
        pairs: ['5aad|english'],
        employee: { id: 31, fullName: 'Deq' },
      };
    return { head: true, employee: null, name: 'Suuq S' };
  });
  return { svc: new SchoolHomeworkService(repo, reach), rows };
}

describe('SchoolHomeworkService', () => {
  it('a teacher sets homework for their own subject on the timetable, or anything in their home room — and nothing else', async () => {
    const { svc, rows } = make();
    const maths = await svc.create(
      {
        branchId: 128,
        classCode: '4AAD',
        subject: 'Maths',
        title: 'Page 12, ex. 1–5',
        dueOn: '2026-10-01',
      },
      TEACHER,
    );
    expect(maths).toMatchObject({
      classCode: '4aad',
      subject: 'Maths',
      teacherName: 'Mustafe',
      employeeId: 30,
      isActive: true,
      dueOn: '2026-10-01',
    });
    // Home room: any subject.
    const somali = await svc.create(
      {
        branchId: 128,
        classCode: '3aad',
        subject: 'Somali',
        title: 'Read chapter 2',
      },
      TEACHER,
    );
    expect(somali.classCode).toBe('3aad');
    // 4aad is on the timetable for Maths only.
    await expect(
      svc.create(
        { branchId: 128, classCode: '4aad', subject: 'Somali', title: 'x' },
        TEACHER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Not their class at all.
    await expect(
      svc.create(
        { branchId: 128, classCode: '5aad', subject: 'Maths', title: 'x' },
        TEACHER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The office sets anything.
    const office = await svc.create(
      {
        branchId: 128,
        classCode: '9aad',
        subject: 'Physics',
        title: 'Lab report',
      },
      HEAD,
    );
    expect(office).toMatchObject({
      classCode: '9aad',
      teacherName: 'Suuq S',
      employeeId: null,
    });
    expect(rows).toHaveLength(3);
  });

  it('lists what is set for the classes the person reaches; mine=1 narrows to their own; the office reads all', async () => {
    const { svc } = make();
    await svc.create(
      { branchId: 128, classCode: '4aad', subject: 'Maths', title: 'A' },
      TEACHER,
    );
    await svc.create(
      { branchId: 128, classCode: '3aad', subject: 'Somali', title: 'B' },
      TEACHER,
    );
    await svc.create(
      { branchId: 128, classCode: '5aad', subject: 'English', title: 'C' },
      OTHER,
    );
    await svc.create(
      { branchId: 128, classCode: '3aad', subject: 'English', title: 'D' },
      HEAD,
    );
    const mine = await svc.list({ branchId: 128, mine: '1' }, TEACHER);
    expect(mine.items.map((h: any) => h.title).sort()).toEqual(['A', 'B']);
    expect(mine.reach).toEqual(['3aad', '4aad']);
    const reachable = await svc.list({ branchId: 128 }, TEACHER);
    expect(reachable.items.map((h: any) => h.title).sort()).toEqual([
      'A',
      'B',
      'D',
    ]);
    await expect(
      svc.list({ branchId: 128, classCode: '5aad' }, TEACHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const all = await svc.list({ branchId: 128 }, HEAD);
    expect(all.items).toHaveLength(4);
    expect(all.reach).toBeNull();
  });

  it('only the teacher who set it, or the office, edits or removes it; taken-down entries leave the live list', async () => {
    const { svc } = make();
    const a = await svc.create(
      { branchId: 128, classCode: '4aad', subject: 'Maths', title: 'A' },
      TEACHER,
    );
    await expect(
      svc.update(a.id, { branchId: 128, title: 'Z' }, OTHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.update(a.id, { branchId: 115, title: 'Z' }, TEACHER),
    ).rejects.toBeInstanceOf(NotFoundException);
    const edited = await svc.update(
      a.id,
      { branchId: 128, title: 'A2', dueOn: '', isActive: false },
      TEACHER,
    );
    expect(edited).toMatchObject({ title: 'A2', dueOn: null, isActive: false });
    expect((await svc.list({ branchId: 128 }, TEACHER)).items).toHaveLength(0);
    expect(
      (await svc.list({ branchId: 128, all: '1' }, TEACHER)).items,
    ).toHaveLength(1);
    await svc.update(a.id, { branchId: 128, isActive: true }, HEAD);
    await expect(svc.remove(a.id, 128, OTHER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await svc.remove(a.id, 128, HEAD)).toEqual({
      status: 'REMOVED',
      id: a.id,
    });
  });

  it('hands the families a class’s live homework and counts what falls due today or later', async () => {
    const { svc } = make();
    await svc.create(
      {
        branchId: 128,
        classCode: '3aad',
        subject: 'Maths',
        title: 'Due later',
        dueOn: '2099-01-10',
      },
      TEACHER,
    );
    await svc.create(
      {
        branchId: 128,
        classCode: '3aad',
        subject: 'Maths',
        title: 'Due today',
        dueOn: '2099-01-01',
      },
      TEACHER,
    );
    await svc.create(
      {
        branchId: 128,
        classCode: '3aad',
        subject: 'Somali',
        title: 'Long past',
        dueOn: '2020-01-01',
      },
      TEACHER,
    );
    const off = await svc.create(
      { branchId: 128, classCode: '3aad', subject: 'Somali', title: 'Off' },
      TEACHER,
    );
    await svc.update(off.id, { branchId: 128, isActive: false }, TEACHER);
    await svc.create(
      {
        branchId: 128,
        classCode: '4aad',
        subject: 'Maths',
        title: 'Other class',
        dueOn: '2099-01-01',
      },
      TEACHER,
    );
    await svc.create(
      { branchId: 128, classCode: '3aad', subject: 'Maths', title: 'No date' },
      TEACHER,
    );
    const items = await svc.forClasses(128, ['3AAD']);
    // "Long past" is within the window by creation date, so it still shows; the taken-down one does not.
    expect(items.map((h) => h.title).sort()).toEqual([
      'Due later',
      'Due today',
      'Long past',
      'No date',
    ]);
    const due = await svc.dueCounts(128, ['3aad', '4aad'], '2099-01-01');
    // The undated one is still to do — the family's list shows it under
    // "to do", so the count on their home page includes it.
    expect(due.get('3aad')).toBe(3);
    expect(due.get('4aad')).toBe(1);
    expect(await svc.forClasses(128, [])).toEqual([]);
  });
});
