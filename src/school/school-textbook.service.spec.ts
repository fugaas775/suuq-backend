import { SchoolTextbookService } from './school-textbook.service';

/** The textbook register: titles per class, one loan row per book per pupil. */
function makeService({ titles = [] as any[], loans = [] as any[] } = {}) {
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
            where.status._value.includes(l.status)),
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
  return { svc: new SchoolTextbookService(titleRepo, loanRepo), titles, loans };
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
      '1': { issued: 1, lost: 0 },
      '2': { issued: 0, lost: 1 },
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
});
