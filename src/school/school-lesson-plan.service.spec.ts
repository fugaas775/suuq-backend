import { ForbiddenException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { SchoolLessonPlanService } from './school-lesson-plan.service';

/* Lesson plans: a teacher's own word on their own lessons; the office reads
   and signs off. */
function makeService({
  plans = [] as any[],
  mine = {
    employee: { id: 30, fullName: 'Mustafe' },
    slots: [
      { classCode: '3aad', subject: 'Maths' },
      { classCode: '4aad', subject: 'Maths' },
    ],
  } as any,
  head = false,
} = {}) {
  let nextId = 100;
  const repo: any = {
    find: async ({ where }: any) =>
      plans.filter(
        (p) =>
          p.branchId === where.branchId &&
          (where.employeeId === undefined ||
            p.employeeId === where.employeeId) &&
          (where.classCode === undefined || p.classCode === where.classCode),
      ),
    findOne: async ({ where }: any) =>
      plans.find((p) =>
        where.id !== undefined
          ? Number(p.id) === Number(where.id) && p.branchId === where.branchId
          : p.branchId === where.branchId &&
            p.employeeId === where.employeeId &&
            p.lessonDate === where.lessonDate &&
            p.periodCode === where.periodCode &&
            p.classCode === where.classCode,
      ) || null,
    create: (p: any) => ({ ...p }),
    save: async (row: any) => {
      if (!row.id) {
        row.id = nextId++;
        plans.push(row);
      }
      return row;
    },
  };
  const timetable: any = { mine: async () => mine };
  const scope: any = {
    resolve: async () => ({
      scoped: !head,
      codes: head ? null : new Set(['3aad']),
      recordedBy: head ? 'Hibo (deputy)' : 'Mustafe',
    }),
  };
  return { svc: new SchoolLessonPlanService(repo, timetable, scope), plans };
}
const ACTOR = { id: 900, email: 'm@x', roles: ['POS_OPERATOR'] };
const HEAD = { id: 1, email: 'h@x', roles: [] };
const PLAN = {
  branchId: 115,
  lessonDate: '2026-09-21',
  periodCode: 'p1',
  classCode: '3AAD',
  subject: 'Maths',
  topic: 'Fractions',
};

describe('SchoolLessonPlanService', () => {
  it('writes a plan for a lesson on the teacher’s own timetable, and edits the same slot rather than duplicating it', async () => {
    const { svc, plans } = makeService();
    const a = await svc.upsert(PLAN, ACTOR);
    expect(a).toMatchObject({
      employeeId: 30,
      teacherName: 'Mustafe',
      classCode: '3aad',
      periodCode: 'P1',
      status: 'PLANNED',
      topic: 'Fractions',
    });
    await svc.upsert({ ...PLAN, topic: 'Fractions — adding' }, ACTOR);
    expect(plans).toHaveLength(1);
    expect(plans[0].topic).toBe('Fractions — adding');
  });

  it('refuses a lesson the timetable does not give the teacher, and a login with no staff row', async () => {
    const { svc } = makeService();
    await expect(
      svc.upsert({ ...PLAN, classCode: '7th' } as any, ACTOR),
    ).rejects.toThrow(/7th for Maths/);
    await expect(
      svc.upsert({ ...PLAN, subject: 'Science' } as any, ACTOR),
    ).rejects.toThrow(/Science/);
    const { svc: none } = makeService({ mine: { employee: null, slots: [] } });
    await expect(none.upsert(PLAN as any, ACTOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets only the teacher say what became of it, dating a taught lesson and undating a postponed one', async () => {
    const { svc, plans } = makeService();
    const a = await svc.upsert(PLAN, ACTOR);
    const taught = await svc.setStatus(
      Number(a.id),
      { branchId: 115, status: 'TAUGHT' } as any,
      ACTOR,
    );
    expect(taught.taughtOn).toBe('2026-09-21');
    const later = await svc.setStatus(
      Number(a.id),
      { branchId: 115, status: 'POSTPONED', statusNote: 'sports day' } as any,
      ACTOR,
    );
    expect(later.taughtOn).toBeNull();
    expect(later.statusNote).toBe('sports day');
    // Another teacher, same branch: not theirs.
    const { svc: other } = makeService({
      plans,
      mine: { employee: { id: 31, fullName: 'Cabdi' }, slots: [] },
    });
    await expect(
      other.setStatus(
        Number(a.id),
        { branchId: 115, status: 'TAUGHT' } as any,
        { id: 901 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads own plans with mine=1, everyone’s only as a head, and signs off only as a head', async () => {
    const { svc, plans } = makeService();
    const a = await svc.upsert(PLAN, ACTOR);
    const own = await svc.list(
      { branchId: 115, from: '2026-09-21', to: '2026-09-27', mine: '1' },
      ACTOR,
    );
    expect(own.employee?.id).toBe(30);
    expect(own.items).toHaveLength(1);
    await expect(
      svc.list(
        { branchId: 115, from: '2026-09-21', to: '2026-09-27' } as any,
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.review(
        Number(a.id),
        { branchId: 115, reviewComment: 'ok' } as any,
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { svc: head } = makeService({ plans, head: true });
    const all = await head.list(
      { branchId: 115, from: '2026-09-21', to: '2026-09-27' },
      HEAD,
    );
    expect(all.items).toHaveLength(1);
    const reviewed = await head.review(
      Number(a.id),
      { branchId: 115, reviewComment: 'Good — add a worked example.' },
      HEAD,
    );
    expect(reviewed.reviewedByName).toBe('Hibo (deputy)');
    expect(reviewed.reviewedAt).toBeInstanceOf(Date);
    const board = await head.summary(115, '2026-09-21', '2026-09-27', HEAD);
    expect(board.teachers).toEqual([
      {
        employeeId: 30,
        teacherName: 'Mustafe',
        planned: 1,
        taught: 0,
        partly: 0,
        postponed: 0,
        cancelled: 0,
        reviewed: 1,
        total: 1,
      },
    ]);
  });

  it('sends a plan back for review when what it says changes — and keeps the sign-off on a same-words re-save', async () => {
    const { svc, plans } = makeService();
    const a = await svc.upsert(PLAN, ACTOR);
    const { svc: head } = makeService({ plans, head: true });
    await head.review(
      Number(a.id),
      { branchId: 115, reviewComment: 'Good' },
      HEAD,
    );
    expect(plans[0].reviewedAt).toBeInstanceOf(Date);

    // The same words again: still signed off.
    await svc.upsert(PLAN, ACTOR);
    expect(plans[0]).toMatchObject({
      reviewedByName: 'Hibo (deputy)',
      reviewComment: 'Good',
    });

    // A different topic: the sign-off was on a plan that no longer exists.
    await svc.upsert(
      { ...PLAN, topic: 'Fractions', objectives: 'Add unlike fractions' },
      ACTOR,
    );
    expect(plans[0]).toMatchObject({
      reviewedAt: null,
      reviewedByName: null,
      reviewedByUserId: null,
      reviewComment: null,
      objectives: 'Add unlike fractions',
    });
  });

  it('retries a lost insert race as an update of the row that won', async () => {
    const { svc, plans } = makeService();
    const winner = {
      id: 55,
      branchId: 115,
      employeeId: 30,
      lessonDate: '2026-09-21',
      periodCode: 'P1',
      classCode: '3aad',
      subject: 'Maths',
      topic: 'From the other tab',
      status: 'TAUGHT',
    };
    // The repository says "no row" once, then the INSERT loses to the other
    // tab's — which is in the table by the time the retry looks again.
    const repo = (svc as any).plans;
    const realFindOne = repo.findOne;
    let first = true;
    repo.findOne = async (opts: any) => {
      if (first) {
        first = false;
        return null;
      }
      return realFindOne(opts);
    };
    const realSave = repo.save;
    let raced = false;
    repo.save = async (row: any) => {
      if (!raced && !row.id) {
        raced = true;
        plans.push(winner);
        throw new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'uq_pos_school_lesson_plans_lesson',
          }),
        );
      }
      return realSave(row);
    };
    const saved = await svc.upsert({ ...PLAN, topic: 'Fractions' }, ACTOR);
    expect(saved.id).toBe(55);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ topic: 'Fractions', status: 'TAUGHT' });
  });

  it('does not swallow any other database failure', async () => {
    const { svc } = makeService();
    (svc as any).plans.save = async () => {
      throw new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('boom'), { code: '23502' }),
      );
    };
    await expect(svc.upsert(PLAN, ACTOR)).rejects.toBeInstanceOf(
      QueryFailedError,
    );
  });
});
