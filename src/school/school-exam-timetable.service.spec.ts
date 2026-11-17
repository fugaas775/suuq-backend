import { BadRequestException, ConflictException } from '@nestjs/common';
import { SchoolExamTimetableService } from './school-exam-timetable.service';

/**
 * Mid Exam I, 2026-11-17 (SMAG + SMAQ): what the service refuses before it
 * writes, and what a family is shown.
 */
function make({
  classes = ['KG II', '1aad', '7th'],
  existing = [] as any[],
} = {}) {
  const saved: any[] = [...existing];
  const exams = {
    find: jest.fn(async ({ where }: any) =>
      saved.filter(
        (r) =>
          r.branchId === where.branchId &&
          (!where.status || r.status === where.status),
      ),
    ),
    findOne: jest.fn(
      async ({ where }: any) =>
        saved.find(
          (r) =>
            Number(r.id) === Number(where.id) && r.branchId === where.branchId,
        ) || null,
    ),
    create: jest.fn((row: any) => ({ ...row })),
    save: jest.fn(async (row: any) => {
      if (!row.id) {
        row.id = saved.length + 1;
        saved.push(row);
      }
      return row;
    }),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => {
      let title = '';
      const qb: any = {
        where: () => qb,
        andWhere: (_s: string, p: any) => {
          title = p.t;
          return qb;
        },
        getOne: async () =>
          saved.find((r) => r.title.toLowerCase() === title) || null,
      };
      return qb;
    }),
  };
  const classRepo = {
    find: jest.fn(async () => classes.map((code) => ({ code }))),
  };
  const svc = new SchoolExamTimetableService(exams as any, classRepo as any);
  return { svc, saved };
}
const base = {
  branchId: 115,
  title: 'Mid Exam I',
  startsOn: '2026-11-23',
  sittings: [
    {
      date: '2026-11-23',
      start: '08:00',
      end: '08:30',
      classCode: 'kg ii',
      subject: 'English',
    },
    {
      date: '2026-11-23',
      start: '08:40',
      end: '09:10',
      classCode: 'KG II',
      subject: 'Maths',
    },
    {
      date: '2026-11-23',
      start: '08:00',
      end: '08:40',
      classCode: '7TH',
      subject: 'Biology',
    },
  ],
};

describe('SchoolExamTimetableService', () => {
  it('saves the exam with class codes in the registry’s spelling, in time order', async () => {
    const { svc } = make();
    const r = await svc.create(base as any, 1);
    expect(r.sittings.map((s) => `${s.classCode} ${s.start}`)).toEqual([
      '7th 08:00',
      'KG II 08:00',
      'KG II 08:40',
    ]);
    expect(r.status).toBe('DRAFT');
  });

  it('refuses a class that is not the school’s', async () => {
    const { svc } = make();
    await expect(
      svc.create(
        {
          ...base,
          sittings: [{ ...base.sittings[0], classCode: '9th' }],
        } as any,
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a class sitting two exams at once', async () => {
    const { svc } = make();
    const clash = {
      ...base,
      sittings: [
        ...base.sittings,
        {
          date: '2026-11-23',
          start: '08:20',
          end: '09:00',
          classCode: 'KG II',
          subject: 'Somali',
        },
      ],
    };
    await expect(svc.create(clash as any, 1)).rejects.toThrow(
      /at the same time/,
    );
  });

  it('refuses an exam that ends before it starts', async () => {
    const { svc } = make();
    await expect(
      svc.create(
        { ...base, sittings: [{ ...base.sittings[0], end: '07:50' }] } as any,
        1,
      ),
    ).rejects.toThrow(/ends before it starts/);
  });

  it('refuses a second exam of the same name', async () => {
    const { svc } = make();
    await svc.create(base as any, 1);
    await expect(
      svc.create({ ...base, title: 'mid exam i' } as any, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('shows a family only PUBLISHED exams, and only their child’s class', async () => {
    const { svc } = make();
    await svc.create({ ...base, status: 'PUBLISHED' } as any, 1);
    await svc.create({ ...base, title: 'Draft one' } as any, 1);
    const out = await svc.publishedFor(115, 'kg ii');
    expect(out).toHaveLength(1);
    expect(out[0].sittings.map((s) => s.subject)).toEqual(['English', 'Maths']);
    expect(await svc.publishedFor(115, null)).toEqual([]);
  });
});
