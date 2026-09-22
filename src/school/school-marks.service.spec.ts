import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  SchoolMarksService,
  applyMarkReport,
  mergeMark,
  normalizeAcademicRecord,
} from './school-marks.service';
import { canFileMarkReports } from './school-marks.policy';

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
      { name: 'Final-exam 1', score: 50, outOf: 100 },
    ]);
    expect(maths.total).toBe(80);
    // The imported Mid-exam 1 carries no out-of, so the subject keeps its own.
    expect(maths.outOf).toBe(100);
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
    // Stored under the canonical label, whatever case the sheet used.
    expect(maths.assessments).toEqual([
      { name: 'Mid-exam 1', score: 35, outOf: 100 },
    ]);
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

  it('folds "Mid 1" and "Mid-exam 1" into one assessment — the exam is not counted twice', () => {
    const next = mergeMark(RECORD, {
      ...base,
      subject: 'Maths',
      assessment: 'Mid 1',
      score: 28,
    });
    const maths = next.reports[0].subjects.find((s) => s.subject === 'Maths');
    expect(maths.assessments).toEqual([
      { name: 'Mid-exam 1', score: 28, outOf: 100 },
    ]);
    expect(maths.total).toBe(28);
  });

  it('keeps two headings written outside a–z apart, rather than folding them to nothing', () => {
    const a = mergeMark(undefined, {
      ...base,
      subject: 'Amharic',
      assessment: 'ፈተና 1',
      score: 10,
      outOf: 20,
    });
    const b = mergeMark(a, {
      ...base,
      subject: 'Amharic',
      assessment: 'ፈተና 2',
      score: 15,
      outOf: 20,
    });
    expect(b.reports[0].subjects[0].assessments).toHaveLength(2);
  });

  it('refuses Total — and its Somali spellings — as an assessment', () => {
    for (const assessment of ['Total', 'wadarta', 'Guud', 'Wadarta Guud']) {
      expect(() =>
        mergeMark(RECORD, { ...base, subject: 'Maths', assessment, score: 9 }),
      ).toThrow(BadRequestException);
    }
  });

  it("sums the subject's out-of from its assessments — 12/15 and 30/30 is 42 of 45, never 42 of 30", () => {
    const one = mergeMark(undefined, {
      ...base,
      subject: 'English',
      assessment: 'Mid-exam 1',
      outOf: 15,
      score: 12,
    });
    const two = mergeMark(one, {
      ...base,
      subject: 'English',
      assessment: 'Final-exam 1',
      outOf: 30,
      score: 30,
    });
    const english = two.reports[0].subjects[0];
    expect(english.total).toBe(42);
    expect(english.outOf).toBe(45);
    expect(english.assessments).toEqual([
      { name: 'Mid-exam 1', score: 12, outOf: 15 },
      { name: 'Final-exam 1', score: 30, outOf: 30 },
    ]);
  });

  it("never lays the sheet's out-of over a legacy subject whose assessments carry none", () => {
    const legacy = {
      reports: [
        {
          term: '2019-S1',
          subjects: [
            {
              subject: 'Maths',
              outOf: 100,
              total: 60,
              assessments: [{ name: 'Mid-exam 1', score: 60 }],
            },
          ],
        },
      ],
    };
    const next = mergeMark(legacy, {
      ...base,
      subject: 'Maths',
      assessment: 'Final-exam 1',
      outOf: 30,
      score: 25,
    });
    expect(next.reports[0].subjects[0]).toMatchObject({
      total: 85,
      outOf: 100,
    });
  });
});

describe('normalizeAcademicRecord', () => {
  it("keeps an assessment's own out-of, and drops a malformed one", () => {
    const out = normalizeAcademicRecord({
      reports: [
        {
          term: '2019-S1',
          subjects: [
            {
              subject: 'Maths',
              assessments: [
                { name: 'Mid-exam 1', score: 12, outOf: 15 },
                { name: 'Final-exam 1', score: 20, outOf: 'x' },
                { name: '', score: 3 },
              ],
            },
          ],
        },
      ],
    });
    expect(out.reports[0].subjects[0].assessments).toEqual([
      { name: 'Mid-exam 1', score: 12, outOf: 15 },
      { name: 'Final-exam 1', score: 20 },
    ]);
  });
});

function makeService({
  ownerId = 1863,
  assignment = null as any,
  carts = [] as any[],
  mine = { employee: null, slots: [] } as any,
} = {}) {
  // What reached the database: one entry per snapshot-only UPDATE, and the
  // options every locked read was made with.
  const saved: any[] = [];
  const reads: any[] = [];
  const em: any = {
    find: async (_entity: any, opts: any) => {
      reads.push(opts);
      const ids = (opts.where.id._value ?? opts.where.id.value ?? []).map(
        Number,
      );
      return carts
        .filter(
          (c) =>
            ids.includes(Number(c.id)) && c.branchId === opts.where.branchId,
        )
        .sort((a, b) => Number(a.id) - Number(b.id));
    },
    update: async (_entity: any, criteria: any, partial: any) => {
      saved.push({ id: criteria.id, ...partial });
      return { affected: 1 };
    },
  };
  const cartsRepo: any = {
    manager: { transaction: async (fn: any) => fn(em) },
    // A whole-entity save would write back total, status and metadata from
    // the copy read — the marks routes must never use it.
    save: async () => {
      throw new Error('save(entity) used on a marks write');
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
  return { svc, saved, reads };
}

const pupil = (id: number, cls = '3aad') => ({
  id,
  branchId: 128,
  status: 'SUSPENDED',
  total: 2500,
  metadata: { partialPaidAmount: 500 },
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

describe('SchoolMarksService.save — one transaction, the rows locked, the snapshot alone written', () => {
  it('locks the folios in id order and writes ONLY the snapshot column', async () => {
    const { svc, saved, reads } = makeService({
      carts: [pupil(2), pupil(1)],
    });
    await svc.save(
      {
        ...SHEET,
        entries: [
          { folioId: 2, score: 30 },
          { folioId: 1, score: 40 },
        ],
      },
      { id: 1863 },
    );
    expect(reads[0].lock).toEqual({ mode: 'pessimistic_write' });
    expect(reads[0].order).toEqual({ id: 'ASC' });
    expect(saved.map((w) => w.id)).toEqual([1, 2]);
    // Nothing but the snapshot: no total, no status, no metadata.
    for (const write of saved) {
      expect(Object.keys(write).sort()).toEqual(['cartSnapshot', 'id']);
    }
  });

  it('refuses a folio no longer on the roll by name, writing nothing', async () => {
    const gone = { ...pupil(2), status: 'DISCARDED' };
    const { svc, saved } = makeService({ carts: [pupil(1), gone] });
    await expect(
      svc.save(
        {
          ...SHEET,
          entries: [
            { folioId: 1, score: 40 },
            { folioId: 2, score: 30 },
          ],
        },
        { id: 1863 },
      ),
    ).rejects.toThrow(/P2 \(folio 2\) is no longer on the roll/);
    expect(saved).toHaveLength(0);
  });

  it('stores the canonical assessment name and refuses Total before reading a row', async () => {
    const { svc, saved, reads } = makeService({ carts: [pupil(1)] });
    const out = await svc.save(
      {
        ...SHEET,
        assessment: 'mid 1',
        outOf: 20,
        entries: [{ folioId: 1, score: 15 }],
      },
      { id: 1863 },
    );
    expect(out.assessment).toBe('Mid-exam 1');
    const subject =
      saved[0].cartSnapshot.schoolAcademicRecord.reports[0].subjects[0];
    expect(subject.assessments).toEqual([
      { name: 'Mid-exam 1', score: 15, outOf: 20 },
    ]);
    expect(subject.outOf).toBe(20);
    await expect(
      svc.save({ ...SHEET, assessment: 'Wadarta' }, { id: 1863 }),
    ).rejects.toThrow(/Total is the sum/);
    expect(reads).toHaveLength(1);
  });
});

describe('canFileMarkReports — whole reports are the owner’s or a named manager’s', () => {
  const base = { actorId: 2379, ownerId: 1863 };
  it('lets the owner and the platform super-admin', () => {
    expect(canFileMarkReports({ actorId: 1863, ownerId: 1863 })).toBe(true);
    expect(
      canFileMarkReports({ ...base, roles: ['SUPER_ADMIN'], assignment: null }),
    ).toBe(true);
  });
  it('lets a manager holding ENTER_MARKS, and nobody else on staff', () => {
    expect(
      canFileMarkReports({
        ...base,
        assignment: {
          role: 'MANAGER',
          isActive: true,
          capabilities: ['ENTER_MARKS'],
        },
      }),
    ).toBe(true);
    // A manager by rank alone.
    expect(
      canFileMarkReports({
        ...base,
        assignment: { role: 'MANAGER', isActive: true, capabilities: [] },
      }),
    ).toBe(false);
    // A teacher granted ENTER_MARKS enters sheets, not reports.
    expect(
      canFileMarkReports({
        ...base,
        assignment: {
          role: 'OPERATOR',
          isActive: true,
          capabilities: ['ENTER_MARKS'],
        },
      }),
    ).toBe(false);
    // A platform ADMIN is not the school.
    expect(canFileMarkReports({ ...base, roles: ['ADMIN'] })).toBe(false);
  });
});

describe('applyMarkReport — the office’s per-subject merge', () => {
  const stamp = { className: '3aad', recordedAt: 'T', recordedBy: 'Office' };

  it('replaces the named subject in place and leaves every other subject alone', () => {
    const next = applyMarkReport(
      RECORD,
      {
        folioId: 1,
        term: '2019-S1',
        subjects: [
          {
            subject: 'maths',
            assessments: [
              { name: 'Mid 1', score: 12, outOf: 15 },
              { name: 'Final-exam 1', score: 25, outOf: 30 },
            ],
          },
        ],
      },
      stamp,
    );
    const [maths, science] = next.reports[0].subjects;
    expect(maths).toEqual({
      subject: 'maths',
      total: 37,
      outOf: 45,
      assessments: [
        { name: 'Mid-exam 1', score: 12, outOf: 15 },
        { name: 'Final-exam 1', score: 25, outOf: 30 },
      ],
    });
    expect(science).toMatchObject({ subject: 'Science', total: 80 });
    expect(next.reports[0]).toMatchObject({
      position: '2nd',
      remark: 'Good',
      recordedBy: 'Office',
    });
  });

  it('takes a given total and out-of as given, and defaults the out-of to 100 when assessments do not say', () => {
    const next = applyMarkReport(
      undefined,
      {
        folioId: 1,
        term: '2019-S2',
        subjects: [
          { subject: 'Arabic', total: 71 },
          { subject: 'Somali', total: 40, outOf: 50 },
          { subject: 'Art', assessments: [{ name: 'Project', score: 9 }] },
        ],
      },
      stamp,
    );
    const bySubject = Object.fromEntries(
      next.reports[0].subjects.map((s) => [s.subject, s]),
    );
    expect(bySubject.Arabic).toMatchObject({ total: 71, outOf: 100 });
    expect(bySubject.Somali).toMatchObject({ total: 40, outOf: 50 });
    expect(bySubject.Art).toMatchObject({ total: 9, outOf: 100 });
    expect(next.reports[0].className).toBe('3aad');
  });

  it('drops removed subjects before placing the given ones — a re-cased subject survives', () => {
    const next = applyMarkReport(
      RECORD,
      {
        folioId: 1,
        term: '2019-S1',
        removeSubjects: ['maths', 'SCIENCE'],
        subjects: [{ subject: 'Maths', total: 55 }],
      },
      stamp,
    );
    expect(next.reports[0].subjects.map((s) => s.subject)).toEqual(['Maths']);
  });

  it('sets position and remark only when sent, clears them with null, and removes a term left empty', () => {
    const kept = applyMarkReport(
      RECORD,
      { folioId: 1, term: '2019-S1', position: null },
      stamp,
    );
    expect(kept.reports[0].position).toBe('');
    expect(kept.reports[0].remark).toBe('Good');
    const emptied = applyMarkReport(
      RECORD,
      {
        folioId: 1,
        term: '2019-S1',
        removeSubjects: ['Maths', 'Science'],
        position: null,
        remark: null,
      },
      stamp,
    );
    expect(emptied.reports).toEqual([]);
  });

  it('drops a whole term on removeTerm, and sorts the terms newest first', () => {
    const two = applyMarkReport(
      RECORD,
      {
        folioId: 1,
        term: '2020-S1',
        subjects: [{ subject: 'Maths', total: 1 }],
      },
      stamp,
    );
    expect(two.reports.map((r) => r.term)).toEqual(['2020-S1', '2019-S1']);
    const one = applyMarkReport(
      two,
      { folioId: 1, term: '2019-S1', removeTerm: true },
      stamp,
    );
    expect(one.reports.map((r) => r.term)).toEqual(['2020-S1']);
  });

  it('refuses Total keyed as an assessment', () => {
    expect(() =>
      applyMarkReport(
        RECORD,
        {
          folioId: 1,
          term: '2019-S1',
          subjects: [
            { subject: 'Maths', assessments: [{ name: 'TOTAL', score: 80 }] },
          ],
        },
        stamp,
      ),
    ).toThrow(/Total is the sum/);
  });
});

describe('SchoolMarksService.saveReports', () => {
  const ENTRY = {
    folioId: 1,
    term: '2019-S1',
    subjects: [{ subject: 'Maths', total: 70 }],
  };

  it('files a whole report for the owner, snapshot only, and answers each pupil’s record', async () => {
    const { svc, saved, reads } = makeService({
      carts: [pupil(1)],
      mine: { employee: { id: 4, fullName: 'Hibo Office' }, slots: [] },
    });
    const out = await svc.saveReports(
      {
        branchId: 128,
        entries: [ENTRY, { folioId: 1, term: '2019-S1', remark: 'Well done' }],
      },
      { id: 1863, email: 'owner@x' },
    );
    expect(reads[0].lock).toEqual({ mode: 'pessimistic_write' });
    expect(out.saved).toBe(1);
    expect(out.items[0].folioId).toBe(1);
    const report = out.items[0].schoolAcademicRecord.reports[0];
    expect(report).toMatchObject({
      term: '2019-S1',
      className: '3aad',
      remark: 'Well done',
      recordedBy: 'Hibo Office',
    });
    expect(report.subjects).toEqual([
      { subject: 'Maths', total: 70, outOf: 100, assessments: [] },
    ]);
    expect(Object.keys(saved[0]).sort()).toEqual(['cartSnapshot', 'id']);
    // The rest of the snapshot is the row's own.
    expect(saved[0].cartSnapshot.hotelGuestName).toBe('P1');
  });

  it('refuses a teacher holding ENTER_MARKS — a sheet is theirs, a report is not', async () => {
    const { svc, saved } = makeService({
      carts: [pupil(1)],
      assignment: {
        role: 'OPERATOR',
        isActive: true,
        capabilities: ['ENTER_MARKS'],
      },
    });
    await expect(
      svc.saveReports({ branchId: 128, entries: [ENTRY] }, { id: 2465 }),
    ).rejects.toThrow(/Whole reports are filed by the school's owner/);
    expect(saved).toHaveLength(0);
  });

  it('lets a super-admin and a named manager, and names a folio that is not a pupil here', async () => {
    const admin = makeService({ carts: [pupil(1)] });
    await admin.svc.saveReports(
      { branchId: 128, entries: [ENTRY] },
      { id: 5, email: 'root@x', roles: ['SUPER_ADMIN'] },
    );
    expect(admin.saved).toHaveLength(1);
    const manager = makeService({
      carts: [],
      assignment: {
        role: 'MANAGER',
        isActive: true,
        capabilities: ['ENTER_MARKS'],
      },
    });
    await expect(
      manager.svc.saveReports({ branchId: 128, entries: [ENTRY] }, { id: 9 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes nothing when any entry of the batch is refused', async () => {
    const { svc, saved } = makeService({ carts: [pupil(1), pupil(2)] });
    await expect(
      svc.saveReports(
        {
          branchId: 128,
          entries: [
            ENTRY,
            {
              folioId: 2,
              term: '2019-S1',
              subjects: [
                { subject: 'Maths', assessments: [{ name: 'Guud', score: 1 }] },
              ],
            },
          ],
        },
        { id: 1863 },
      ),
    ).rejects.toThrow(/Total is the sum/);
    expect(saved).toHaveLength(0);
  });
});
