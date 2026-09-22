import { BadRequestException, ConflictException } from '@nestjs/common';
import { SchoolTextbookService } from './school-textbook.service';

/** The textbook register: titles per class, one loan row per book per pupil. */
function makeService({
  titles = [] as any[],
  loans = [] as any[],
  slots = [] as any[],
} = {}) {
  let nextId = 100;
  const titleRepo: any = {
    find: async ({ where }: any) =>
      titles.filter(
        (t) =>
          t.branchId === where.branchId &&
          (!where.classCode || t.classCode === where.classCode) &&
          (where.isActive === undefined || t.isActive === where.isActive),
      ),
    findOne: async ({ where }: any) =>
      titles.find(
        (t) =>
          Number(t.id) === Number(where.id) && t.branchId === where.branchId,
      ) || null,
    count: async ({ where }: any) =>
      titles.filter(
        (t) => t.branchId === where.branchId && t.classCode === where.classCode,
      ).length,
    create: (p: any) => ({ ...p }),
    save: async (row: any) => {
      if (!row.id) {
        row.id = nextId++;
        titles.push(row);
      }
      return row;
    },
  };
  const loanRepo: any = {
    find: async ({ where }: any) =>
      loans.filter(
        (l) =>
          l.branchId === where.branchId &&
          (where.folioId === undefined ||
            (where.folioId._value
              ? where.folioId._value.map(Number).includes(Number(l.folioId))
              : Number(l.folioId) === Number(where.folioId))) &&
          (where.classCode === undefined || l.classCode === where.classCode) &&
          (where.status === undefined ||
            (where.status._value
              ? where.status._value.includes(l.status)
              : l.status === where.status)),
      ),
    findOne: async ({ where }: any) =>
      loans.find(
        (l) =>
          Number(l.id) === Number(where.id) && l.branchId === where.branchId,
      ) || null,
    create: (p: any) => ({ ...p }),
    save: async (rows: any) => {
      const list = Array.isArray(rows) ? rows : [rows];
      for (const row of list) {
        if (!row.id) {
          row.id = nextId++;
          loans.push(row);
        }
      }
      return rows;
    },
  };
  const timetable: any = { get: async () => ({ slots }) };
  return {
    svc: new SchoolTextbookService(titleRepo, loanRepo, timetable),
    titles,
    loans,
  };
}

describe('SchoolTextbookService', () => {
  it('lists a title once per class, case-insensitively, and brings a removed one back', async () => {
    const { svc, titles } = makeService();
    const a = await svc.createTitle(
      { branchId: 128, classCode: '3AAD', title: 'Maths Grade 3' },
      1,
    );
    const b = await svc.createTitle(
      { branchId: 128, classCode: '3aad', title: 'maths grade 3' },
      1,
    );
    expect(b.id).toBe(a.id);
    expect(titles).toHaveLength(1);
    expect(titles[0].classCode).toBe('3aad');
    await svc.deactivateTitle(Number(a.id), 128);
    expect(titles[0].isActive).toBe(false);
    const c = await svc.createTitle(
      { branchId: 128, classCode: '3aad', title: 'MATHS GRADE 3' },
      1,
    );
    expect(c.id).toBe(a.id);
    expect(titles[0].isActive).toBe(true);
  });

  it('issues one row per pupil per title, and re-issues onto the same row', async () => {
    const { svc, loans } = makeService();
    await svc.issue(
      {
        branchId: 128,
        classCode: '3aad',
        title: 'Maths Grade 3',
        folioIds: [1, 2, 2],
        issuedAt: '2026-09-15',
      },
      9,
    );
    expect(loans).toHaveLength(2);
    expect(loans[0]).toMatchObject({
      folioId: 1,
      status: 'ISSUED',
      issuedAt: '2026-09-15',
      returnedAt: null,
      issuedByUserId: 9,
    });
    await svc.updateLoan(
      Number(loans[0].id),
      { branchId: 128, status: 'RETURNED' },
      9,
    );
    expect(loans[0].status).toBe('RETURNED');
    expect(loans[0].returnedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await svc.issue(
      {
        branchId: 128,
        classCode: '3aad',
        title: 'maths grade 3',
        folioIds: [1],
        issuedAt: '2026-10-01',
      },
      9,
    );
    expect(loans).toHaveLength(2);
    expect(loans[0]).toMatchObject({
      status: 'ISSUED',
      issuedAt: '2026-10-01',
      returnedAt: null,
    });
  });

  it('marks a book lost with no return date, and counts it as still out', async () => {
    const { svc, loans } = makeService();
    await svc.issue(
      { branchId: 128, classCode: '3aad', title: 'English', folioIds: [1, 2] },
      9,
    );
    await svc.updateLoan(
      Number(loans[1].id),
      { branchId: 128, status: 'LOST', note: 'left in a bajaj' },
      9,
    );
    expect(loans[1]).toMatchObject({
      status: 'LOST',
      returnedAt: null,
      note: 'left in a bajaj',
    });
    const out = await svc.outstanding(128);
    expect(out.byFolio).toEqual({
      '1': { issued: 1, lost: 0, lostUnbilled: 0 },
      '2': { issued: 0, lost: 1, lostUnbilled: 1 },
    });
  });

  it('refuses a title or a class that is blank', async () => {
    const { svc } = makeService();
    await expect(
      svc.createTitle({ branchId: 128, classCode: ' ', title: 'X' }, 1),
    ).rejects.toThrow(/class/);
    await expect(
      svc.issue(
        { branchId: 128, classCode: '3aad', title: ' ', folioIds: [1] },
        1,
      ),
    ).rejects.toThrow(/title/);
  });

  describe("a lost book is money, and money is the office's", () => {
    it('prices a title on the way in, keeps a price a re-listing did not give, and takes one it did', async () => {
      const { svc, titles } = makeService();
      const a = await svc.createTitle(
        {
          branchId: 128,
          classCode: '3aad',
          title: 'Maths',
          replacementPrice: 250,
        },
        1,
      );
      expect(titles[0].replacementPrice).toBe(250);
      await svc.deactivateTitle(Number(a.id), 128);
      await svc.createTitle(
        { branchId: 128, classCode: '3aad', title: 'maths' },
        1,
      );
      expect(titles[0].isActive).toBe(true);
      expect(titles[0].replacementPrice).toBe(250);
      await svc.createTitle(
        {
          branchId: 128,
          classCode: '3aad',
          title: 'MATHS',
          replacementPrice: 300.456,
        },
        1,
      );
      expect(titles[0].replacementPrice).toBe(300.46);
    });

    it('renames or prices a title, refuses a rename onto a classmate, and clears a price with null', async () => {
      const { svc, titles } = makeService();
      const a = await svc.createTitle(
        { branchId: 128, classCode: '3aad', title: 'Maths' },
        1,
      );
      await svc.createTitle(
        { branchId: 128, classCode: '3aad', title: 'English' },
        1,
      );
      await svc.updateTitle(Number(a.id), {
        branchId: 128,
        replacementPrice: 180,
      });
      expect(titles[0].replacementPrice).toBe(180);
      await svc.updateTitle(Number(a.id), {
        branchId: 128,
        title: 'Maths Grade 3',
      });
      expect(titles[0].title).toBe('Maths Grade 3');
      await expect(
        svc.updateTitle(Number(a.id), { branchId: 128, title: 'english' }),
      ).rejects.toThrow(/already lists/);
      await svc.updateTitle(Number(a.id), {
        branchId: 128,
        replacementPrice: null,
      });
      expect(titles[0].replacementPrice).toBeNull();
      await expect(
        svc.updateTitle(999, { branchId: 128, replacementPrice: 1 }),
      ).rejects.toThrow(/not found/);
    });

    it('lists the lost books alone when asked, and counts the unbilled ones per pupil', async () => {
      const { svc, loans } = makeService();
      await svc.issue(
        {
          branchId: 128,
          classCode: '3aad',
          title: 'Maths',
          folioIds: [1, 2, 3],
        },
        1,
      );
      await svc.updateLoan(
        Number(loans[0].id),
        { branchId: 128, status: 'LOST' },
        1,
      );
      await svc.updateLoan(
        Number(loans[1].id),
        { branchId: 128, status: 'LOST' },
        1,
      );
      await svc.updateLoan(
        Number(loans[2].id),
        { branchId: 128, status: 'RETURNED' },
        1,
      );
      const lost = await svc.listLoans(128, { status: 'LOST' });
      expect(lost.items.map((l: any) => l.folioId)).toEqual([1, 2]);
      await svc.markBilled(
        Number(loans[0].id),
        { branchId: 128, amount: 250, lineId: 'line-a' },
        7,
      );
      const { byFolio } = await svc.outstanding(128);
      expect(byFolio['1']).toEqual({ issued: 0, lost: 1, lostUnbilled: 0 });
      expect(byFolio['2']).toEqual({ issued: 0, lost: 1, lostUnbilled: 1 });
      expect(byFolio['3']).toBeUndefined();
    });

    it('bills a lost book once: not a book still out, not a returned one, and never twice under another line', async () => {
      const { svc, loans } = makeService();
      await svc.issue(
        { branchId: 128, classCode: '3aad', title: 'Maths', folioIds: [1, 2] },
        1,
      );
      await expect(
        svc.markBilled(
          Number(loans[0].id),
          { branchId: 128, amount: 250, lineId: 'x' },
          7,
        ),
      ).rejects.toThrow(/Only a lost book/);
      await svc.updateLoan(
        Number(loans[0].id),
        { branchId: 128, status: 'LOST' },
        1,
      );
      const billed = await svc.markBilled(
        Number(loans[0].id),
        { branchId: 128, amount: 250, lineId: 'line-a' },
        7,
      );
      expect(billed.billedAmount).toBe(250);
      expect(billed.billedLineId).toBe('line-a');
      expect(billed.billedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(billed.updatedByUserId).toBe(7);
      // The same line again is the same bill — idempotent for a retried write.
      const again = await svc.markBilled(
        Number(loans[0].id),
        { branchId: 128, amount: 250, lineId: 'line-a' },
        7,
      );
      expect(again.billedAt).toBe(billed.billedAt);
      await expect(
        svc.markBilled(
          Number(loans[0].id),
          { branchId: 128, amount: 250, lineId: 'line-b' },
          7,
        ),
      ).rejects.toThrow(/already billed/);
      // A billed lost book cannot be filed found from the register: the
      // charge would stand on a book the school has. The office unbills it.
      for (const status of ['ISSUED', 'RETURNED'] as const) {
        const err = await svc
          .updateLoan(Number(loans[0].id), { branchId: 128, status }, 1)
          .catch((e) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toMatchObject({
          code: 'LOST_BOOK_BILLED',
          message: expect.stringMatching(
            /billed 250 on \d{4}-\d{2}-\d{2}\. The office takes the charge off/,
          ),
        });
      }
      expect(loans[0]).toMatchObject({
        status: 'LOST',
        billedLineId: 'line-a',
      });
      // Re-saving it LOST (a note) is not leaving LOST.
      await svc.updateLoan(
        Number(loans[0].id),
        { branchId: 128, status: 'LOST', note: 'still missing' },
        1,
      );
      await expect(
        svc.markBilled(
          Number(loans[1].id),
          { branchId: 999, amount: 1, lineId: 'z' },
          7,
        ),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('a book belongs to a subject, and the subject teacher provides it', () => {
    it('keeps the subject a teacher gave, takes one on a re-listing, and clears it with null', async () => {
      const { svc, titles } = makeService();
      const a = await svc.createTitle(
        {
          branchId: 128,
          classCode: '3aad',
          title: 'Maths Grade 3',
          subject: 'Maths',
        },
        1,
      );
      expect(titles[0].subject).toBe('Maths');
      await svc.deactivateTitle(Number(a.id), 128);
      await svc.createTitle(
        { branchId: 128, classCode: '3aad', title: 'maths grade 3' },
        1,
      );
      expect(titles[0].subject).toBe('Maths');
      await svc.createTitle(
        {
          branchId: 128,
          classCode: '3aad',
          title: 'MATHS GRADE 3',
          subject: 'Mathematics',
        },
        1,
      );
      expect(titles[0].subject).toBe('Mathematics');
      await svc.updateTitle(Number(a.id), { branchId: 128, subject: null });
      expect(titles[0].subject).toBeNull();
      await svc.updateTitle(Number(a.id), {
        branchId: 128,
        subject: '  Maths ',
      });
      expect(titles[0].subject).toBe('Maths');
      const b = await svc.createTitle(
        { branchId: 128, classCode: '3aad', title: 'Atlas' },
        1,
      );
      expect(b.subject).toBeNull();
    });
  });

  describe('a teacher hands out books in their own classes only', () => {
    const scope = {
      assert: (classCode: unknown) => {
        if (String(classCode).toLowerCase() !== '3aad')
          throw new Error(`${classCode} is not one of your classes`);
      },
    };
    it('refuses a title, an issue and a loan change outside the scope, and allows them inside it', async () => {
      const { svc, loans } = makeService();
      await expect(
        svc.createTitle(
          { branchId: 128, classCode: '4aad', title: 'Maths' },
          1,
          scope,
        ),
      ).rejects.toThrow(/4aad is not/);
      await svc.createTitle(
        { branchId: 128, classCode: '3aad', title: 'Maths' },
        1,
        scope,
      );
      await expect(
        svc.issue(
          { branchId: 128, classCode: '4AAD', title: 'Maths', folioIds: [1] },
          1,
          scope,
        ),
      ).rejects.toThrow(/4aad is not/i);
      await svc.issue(
        { branchId: 128, classCode: '3aad', title: 'Maths', folioIds: [1] },
        1,
        scope,
      );
      // Another class's loan cannot be touched by this teacher, even by id.
      await svc.issue(
        { branchId: 128, classCode: '4aad', title: 'Atlas', folioIds: [9] },
        1,
      );
      const foreign = loans.find((l) => l.classCode === '4aad');
      await expect(
        svc.updateLoan(
          Number(foreign.id),
          { branchId: 128, status: 'RETURNED' },
          1,
          scope,
        ),
      ).rejects.toThrow(/4aad is not/);
      await svc.updateLoan(
        Number(loans[0].id),
        { branchId: 128, status: 'RETURNED' },
        1,
        scope,
      );
      expect(loans[0].status).toBe('RETURNED');
      // The office passes no scope and is refused nothing.
      await svc.updateLoan(
        Number(foreign.id),
        { branchId: 128, status: 'RETURNED' },
        1,
      );
    });
  });

  describe('the shelf is made of the timetable’s subjects', () => {
    const slots = [
      { classCode: '3aad', subject: 'Mathematics' },
      { classCode: '3AAD', subject: 'mathematics' },
      { classCode: '3aad', subject: 'English' },
      { classCode: '4aad', subject: 'Science' },
      { classCode: '4aad', subject: '' },
    ];
    it('lists a class’s subjects once each, spelled as the timetable first spells them', async () => {
      const { svc } = makeService({ slots });
      expect(await svc.subjectsFor(128, '3AAD')).toEqual({
        classCode: '3aad',
        subjects: ['Mathematics', 'English'],
      });
      expect((await svc.subjectsFor(128, '9th')).subjects).toEqual([]);
    });
    it('seeds one title per subject, idempotently, for one class or the whole school', async () => {
      const { svc, titles } = makeService({ slots });
      const one = await svc.seedFromTimetable(128, '3aad', 1);
      expect(one).toEqual({ classes: 1, created: 2, existing: 0 });
      expect(
        titles.map((t) => `${t.classCode}:${t.title}:${t.subject}`),
      ).toEqual(['3aad:Mathematics:Mathematics', '3aad:English:English']);
      const all = await svc.seedFromTimetable(128, null, 1);
      expect(all).toEqual({ classes: 2, created: 1, existing: 2 });
      expect(titles).toHaveLength(3);
      // A teacher's class only; the whole school is refused by the scope the controller passes.
      const scope = {
        assert: (c: unknown) => {
          if (String(c) !== '3aad')
            throw new Error(`${c} is not one of your classes`);
        },
      };
      await expect(
        svc.seedFromTimetable(128, '4aad', 1, scope),
      ).rejects.toThrow(/4aad is not/);
    });
    it('summarises the shelf per class with counts, and names the subjects still without a book', async () => {
      const { svc, loans } = makeService({ slots });
      await svc.seedFromTimetable(128, '3aad', 1);
      await svc.issue(
        {
          branchId: 128,
          classCode: '3aad',
          title: 'Mathematics',
          folioIds: [1, 2],
        },
        1,
      );
      await svc.updateLoan(
        Number(loans[1].id),
        { branchId: 128, status: 'LOST' },
        1,
      );
      const { classes } = await svc.summary(128);
      expect(classes.map((c) => c.classCode)).toEqual(['3aad', '4aad']);
      expect(
        classes[0].titles.map(
          (t) =>
            `${t.title}:${t.issued}/${t.returned}/${t.lost}/${t.lostUnbilled}`,
        ),
      ).toEqual(['Mathematics:1/0/1/1', 'English:0/0/0/0']);
      expect(classes[0].missingSubjects).toEqual([]);
      expect(classes[1].titles).toEqual([]);
      expect(classes[1].missingSubjects).toEqual(['Science']);
    });
  });

  describe('a billed lost book turns up: the office unbills it, and a new copy is a new loan', () => {
    async function billedLoss() {
      const made = makeService();
      await made.svc.issue(
        { branchId: 128, classCode: '3aad', title: 'Maths', folioIds: [1] },
        1,
      );
      await made.svc.updateLoan(
        Number(made.loans[0].id),
        { branchId: 128, status: 'LOST' },
        1,
      );
      await made.svc.markBilled(
        Number(made.loans[0].id),
        { branchId: 128, amount: 250, lineId: 'line-a' },
        7,
      );
      return made;
    }

    it('clears the bill and files the book returned today', async () => {
      const { svc, loans } = await billedLoss();
      const row = await svc.unbill(Number(loans[0].id), { branchId: 128 }, 8);
      expect(row).toMatchObject({
        status: 'RETURNED',
        billedAt: null,
        billedAmount: null,
        billedLineId: null,
        updatedByUserId: 8,
      });
      expect(row.returnedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('unbills only a lost book, and only on its own branch', async () => {
      const { svc, loans } = await billedLoss();
      await svc.unbill(Number(loans[0].id), { branchId: 128 }, 8);
      await expect(
        svc.unbill(Number(loans[0].id), { branchId: 128 }, 8),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.unbill(Number(loans[0].id), { branchId: 999 }, 8),
      ).rejects.toThrow(/not found/);
    });

    it('re-issuing a billed lost copy starts a fresh loan — the old bill stays on the folio line, not on the new book', async () => {
      const { svc, loans } = await billedLoss();
      await svc.issue(
        {
          branchId: 128,
          classCode: '3aad',
          title: 'maths',
          folioIds: [1],
          issuedAt: '2026-10-02',
        },
        1,
      );
      expect(loans).toHaveLength(1);
      expect(loans[0]).toMatchObject({
        status: 'ISSUED',
        issuedAt: '2026-10-02',
        billedAt: null,
        billedAmount: null,
        billedLineId: null,
      });
    });
  });

  describe('a book goes only to a pupil of this school, in the class named', () => {
    it('asks the controller’s pupil check with the class and the ids, before a row is written', async () => {
      const { svc, loans } = makeService();
      const assertPupils = jest.fn(async (_cls: string, ids: number[]) => {
        if (ids.includes(9)) throw new Error('Bilan (4aad) is not in 3aad');
      });
      const scope = { assert: jest.fn(), assertPupils };
      await expect(
        svc.issue(
          {
            branchId: 128,
            classCode: '3AAD',
            title: 'Maths',
            folioIds: [1, 9],
          },
          1,
          scope,
        ),
      ).rejects.toThrow(/not in 3aad/);
      expect(assertPupils).toHaveBeenCalledWith('3aad', [1, 9]);
      expect(loans).toHaveLength(0);
      await svc.issue(
        { branchId: 128, classCode: '3aad', title: 'Maths', folioIds: [1] },
        1,
        scope,
      );
      expect(loans).toHaveLength(1);
    });

    it('holds a teacher to the class a re-issued loan sits in now', async () => {
      const { svc, loans } = makeService();
      // The office issued Maths to pupil 1 while they were in 4aad.
      await svc.issue(
        { branchId: 128, classCode: '4aad', title: 'Maths', folioIds: [1] },
        1,
      );
      const scope = {
        assert: (classCode: unknown) => {
          if (String(classCode).toLowerCase() !== '3aad')
            throw new Error(`${classCode} is not one of your classes`);
        },
      };
      await expect(
        svc.issue(
          { branchId: 128, classCode: '3aad', title: 'Maths', folioIds: [1] },
          1,
          scope,
        ),
      ).rejects.toThrow(/4aad is not one of your classes/);
      expect(loans[0].classCode).toBe('4aad');
    });
  });
});
