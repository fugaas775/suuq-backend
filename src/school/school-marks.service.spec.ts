import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SchoolMarksService, mergeMark } from './school-marks.service';

/**
 * Marks, entered by name. The rule is the withdrawal's — owner, or a granted
 * account — plus a scope: an operator writes only what their timetable puts
 * them in front of. The merge is at the assessment level, so one sheet never
 * touches another, and a subject's total is the sum of its assessments.
 */
const RECORD = {
  version: 1,
  reports: [
    {
      term: '2019-S1',
      className: '3aad',
      position: '2nd',
      remark: 'Good',
      subjects: [
        {
          subject: 'Maths',
          outOf: 100,
          total: 30,
          assessments: [{ name: 'Mid-exam 1', score: 30 }],
        },
        {
          subject: 'Science',
          outOf: 100,
          total: 80,
          assessments: [
            { name: 'Mid-exam 1', score: 35 },
            { name: 'Final-exam 1', score: 45 },
          ],
        },
      ],
    },
  ],
};

describe('mergeMark', () => {
  const base = {
    term: '2019-S1',
    className: '3aad',
    outOf: 100,
    recordedAt: '2026-09-20T08:00:00.000Z',
    recordedBy: 'Cabdiqaadir',
  };

  it('adds an assessment to a subject and re-derives its total, touching nothing else', () => {
    const next = mergeMark(RECORD, {
      ...base,
      subject: 'maths',
      assessment: 'Final-exam 1',
      score: 50,
    });
    const maths = next.reports[0].subjects.find((s) => s.subject === 'Maths');
    expect(maths.assessments).toEqual([
      { name: 'Mid-exam 1', score: 30 },
      { name: 'Final-exam 1', score: 50 },
    ]);
    expect(maths.total).toBe(80);
    expect(
      next.reports[0].subjects.find((s) => s.subject === 'Science').total,
    ).toBe(80);
    expect(next.reports[0].position).toBe('2nd');
    expect(next.reports[0].recordedBy).toBe('Cabdiqaadir');
  });

  it('replaces the same assessment rather than adding a second', () => {
    const next = mergeMark(RECORD, {
      ...base,
      subject: 'Maths',
      assessment: 'MID-EXAM 1',
      score: 35,
    });
    const maths = next.reports[0].subjects.find((s) => s.subject === 'Maths');
    expect(maths.assessments).toEqual([{ name: 'MID-EXAM 1', score: 35 }]);
    expect(maths.total).toBe(35);
  });

  it('clears an assessment with null, and drops a subject left with nothing', () => {
    const next = mergeMark(RECORD, {
      ...base,
      subject: 'Maths',
      assessment: 'Mid-exam 1',
      score: null,
    });
    expect(next.reports[0].subjects.map((s) => s.subject)).toEqual(['Science']);
  });

  it('opens a term and a subject that did not exist, on an empty record', () => {
    const next = mergeMark(undefined, {
      ...base,
      term: '2019-S2',
      subject: 'Amharic',
      assessment: 'Mid-exam 2',
      score: 20,
    });
    expect(next.reports).toHaveLength(1);
    expect(next.reports[0]).toMatchObject({
      term: '2019-S2',
      className: '3aad',
      recordedBy: 'Cabdiqaadir',
    });
    expect(next.reports[0].subjects[0]).toMatchObject({
      subject: 'Amharic',
      total: 20,
      outOf: 100,
    });
  });
});

function makeService({
  ownerId = 1863,
  assignment = null as any,
  carts = [] as any[],
  mine = { employee: null, slots: [] } as any,
} = {}) {
  const saved: any[] = [];
  const cartsRepo: any = {
    find: async ({ where }: any) =>
      carts.filter(
        (c) =>
          (where.id._value ?? where.id.value ?? [])
            .map(Number)
            .includes(Number(c.id)) && c.branchId === where.branchId,
      ),
    save: async (row: any) => {
      saved.push(row);
      return row;
    },
  };
  const branches: any = { findOne: async () => ({ id: 128, ownerId }) };
  const assignments: any = { findOne: async () => assignment };
  const timetable: any = { mine: async () => mine };
  const svc = new SchoolMarksService(
    cartsRepo,
    branches,
    assignments,
    timetable,
  );
  return { svc, saved };
}

const pupil = (id: number, cls = '3aad') => ({
  id,
  branchId: 128,
  cartSnapshot: {
    serviceFormat: 'SCHOOL',
    hotelRoomNumber: cls,
    hotelGuestName: `P${id}`,
    cartLines: [],
  },
});

const SHEET = {
  branchId: 128,
  term: '2019-S1',
  subject: 'Maths',
  assessment: 'Mid-exam 1',
  outOf: 100,
  entries: [{ folioId: 1, score: 40 }],
};

describe('SchoolMarksService.save — who may, and for what', () => {
  it('lets the owner enter any subject in any class', async () => {
    const { svc, saved } = makeService({ carts: [pupil(1)] });
    const out = await svc.save(SHEET, { id: 1863, email: 'owner@x' });
    expect(out).toMatchObject({ saved: 1, subject: 'Maths' });
    expect(
      saved[0].cartSnapshot.schoolAcademicRecord.reports[0].subjects[0],
    ).toMatchObject({ subject: 'Maths', total: 40 });
    // Money and lines survive the write.
    expect(saved[0].cartSnapshot.hotelGuestName).toBe('P1');
  });

  it('refuses a manager who was not named — a mark is not a rank’s to rewrite', async () => {
    const { svc } = makeService({
      carts: [pupil(1)],
      assignment: {
        role: 'MANAGER',
        isActive: true,
        capabilities: ['MANAGE_BRANCH_STAFF'],
      },
    });
    await expect(svc.save(SHEET, { id: 2379 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets a named teacher write the subject their timetable puts them in front of', async () => {
    const { svc, saved } = makeService({
      carts: [pupil(1)],
      assignment: {
        role: 'OPERATOR',
        isActive: true,
        capabilities: ['ENTER_MARKS'],
      },
      mine: {
        employee: { id: 27, fullName: 'Cabdiqaadir' },
        slots: [{ classCode: '3AAD', subject: 'maths' }],
      },
    });
    await svc.save(SHEET, { id: 2465, email: 't@x' });
    expect(
      saved[0].cartSnapshot.schoolAcademicRecord.reports[0].recordedBy,
    ).toBe('Cabdiqaadir');
  });

  it('holds a named teacher to their timetable — not another class, not another subject', async () => {
    const { svc } = makeService({
      carts: [pupil(1, '7th')],
      assignment: {
        role: 'OPERATOR',
        isActive: true,
        capabilities: ['ENTER_MARKS'],
      },
      mine: {
        employee: { id: 27, fullName: 'Cabdiqaadir' },
        slots: [{ classCode: '3aad', subject: 'Maths' }],
      },
    });
    await expect(svc.save(SHEET, { id: 2465 })).rejects.toThrow(
      /7th for Maths/,
    );
    const { svc: svc2 } = makeService({
      carts: [pupil(1)],
      assignment: {
        role: 'OPERATOR',
        isActive: true,
        capabilities: ['ENTER_MARKS'],
      },
      mine: {
        employee: { id: 27, fullName: 'Cabdiqaadir' },
        slots: [{ classCode: '3aad', subject: 'Science' }],
      },
    });
    await expect(svc2.save(SHEET, { id: 2465 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses a teacher without the grant, however many permissions they hold', async () => {
    const { svc } = makeService({
      carts: [pupil(1)],
      assignment: { role: 'OPERATOR', isActive: true, capabilities: [] },
    });
    await expect(svc.save(SHEET, { id: 2465 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('names a folio that is not on the branch', async () => {
    const { svc } = makeService({ carts: [] });
    await expect(svc.save(SHEET, { id: 1863 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("refuses a score above the sheet's out-of by name, before any folio is written", async () => {
    const { svc, saved } = makeService({
      carts: [pupil(1), pupil(2)],
    });
    await expect(
      svc.save(
        {
          ...SHEET,
          outOf: 30,
          entries: [
            { folioId: 1, score: 25 },
            { folioId: 2, score: 87 },
          ],
        },
        { id: 1863 },
      ),
    ).rejects.toThrow(/above 30/);
    expect(saved).toHaveLength(0);
  });
});
