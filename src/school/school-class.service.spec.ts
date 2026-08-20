import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SchoolClassService } from './school-class.service';
import { SchoolClassStatus } from './entities/school-class.entity';

/**
 * The registry's rules, which exist because the product-attribute model it
 * replaces could not enforce any of them.
 */

const stamp = new Date('2026-08-15T08:00:00.000Z');

function makeService({
  existingByCode = null,
  rows = [],
  enrolled = 0,
  // The registry answers three different single-row questions now — "is this
  // code taken?", "how does this branch spell this grade?" and "is this section
  // taken?" — so one blanket getOne can no longer stand in for all of them.
  // Each builder remembers its own conditions and the reply is chosen from
  // them, which keeps every test that only cares about codes arranging nothing.
  gradeSibling = null,
  sectionClash = null,
  sortOrderTaken = 0,
}: any = {}) {
  const saved: any[] = [];
  const deleted: any[] = [];

  const makeQb = () => {
    const conds: string[] = [];
    const qb: any = {
      where: (c: string) => {
        conds.push(String(c));
        return qb;
      },
      andWhere: (c: string) => {
        conds.push(String(c));
        return qb;
      },
      select: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      take: () => qb,
      getOne: async () => {
        const sql = conds.join(' ');
        if (sql.includes('"section"')) return sectionClash;
        if (sql.includes('"gradeCode"')) return gradeSibling;
        return existingByCode;
      },
      getMany: async () => rows,
      getCount: async () =>
        conds.join(' ').includes('"sortOrder"') ? sortOrderTaken : enrolled,
      getRawOne: async () => ({ max: rows.length ? 20 : null }),
    };
    return qb;
  };

  const repo: any = {
    createQueryBuilder: () => makeQb(),
    findOne: async ({ where }: any) =>
      rows.find(
        (r: any) =>
          Number(r.id) === Number(where.id) && r.branchId === where.branchId,
      ) ?? null,
    create: (value: any) => ({ ...value }),
    save: async (value: any) => {
      const list = Array.isArray(value) ? value : [value];
      for (const v of list) {
        saved.push(v);
        v.id = v.id ?? 77;
        v.createdAt = v.createdAt ?? stamp;
        v.updatedAt = stamp;
      }
      return value;
    },
    delete: async (criteria: any) => {
      deleted.push(criteria);
      return { affected: 1 };
    },
  };

  const cartRepo: any = { createQueryBuilder: () => makeQb() };
  return {
    service: new SchoolClassService(repo, cartRepo),
    saved,
    deleted,
  };
}

const row = (over: any = {}) => ({
  id: 1,
  branchId: 115,
  code: '3a',
  name: null,
  gradeCode: null,
  section: null,
  sortOrder: 10,
  feeProductId: null,
  capacity: null,
  status: SchoolClassStatus.ACTIVE,
  metadata: null,
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});

describe('SchoolClassService — a class code is one thing per branch', () => {
  it('refuses a code that already exists in another case', async () => {
    // Every reader keys on the lowercased code — the folio's class, the tuition
    // line's tag, the roster importer's dedupe. "3A" beside "3a" would be two
    // classes on the board and one set of children.
    const { service } = makeService({ existingByCode: row({ code: '3a' }) });
    await expect(
      service.create({ branchId: 115, code: '3A' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('names the existing class as the school spelled it, not as the caller did', async () => {
    const { service } = makeService({ existingByCode: row({ code: '3a' }) });
    await expect(
      service.create({ branchId: 115, code: '3A' } as any),
    ).rejects.toThrow(/"3a" already exists/);
  });

  it('appends a new class to the end rather than piling every one at zero', async () => {
    const { service, saved } = makeService({ rows: [row()] });
    await service.create({ branchId: 115, code: '4aad' });
    expect(saved[0].sortOrder).toBe(30);
  });

  it('honours an explicit position when one is given', async () => {
    const { service, saved } = makeService({ rows: [row()] });
    await service.create({ branchId: 115, code: '4aad', sortOrder: 5 });
    expect(saved[0].sortOrder).toBe(5);
  });
});

describe('SchoolClassService — renaming', () => {
  it('refuses a rename onto a code another class already holds', async () => {
    const { service } = makeService({
      rows: [row({ id: 1, code: '3a' })],
      existingByCode: row({ id: 2, code: '4aad' }),
    });
    await expect(
      service.update(1, { branchId: 115, code: '4aad' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a class to be re-cased to itself', async () => {
    // "3a" → "3A" is the school fixing its own spelling, not a collision.
    const target = row({ id: 1, code: '3a' });
    const { service, saved } = makeService({
      rows: [target],
      existingByCode: target,
    });
    const result = await service.update(1, {
      branchId: 115,
      code: '3A',
    });
    expect(result.code).toBe('3A');
    expect(saved).toHaveLength(1);
  });

  it('will not touch a class belonging to another branch', async () => {
    const { service } = makeService({ rows: [row({ branchId: 115 })] });
    await expect(
      service.update(1, { branchId: 999, code: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears the fee link when explicitly given null', async () => {
    // A class can be un-priced again — that is what happens when the fee product
    // it named is retired.
    const { service } = makeService({ rows: [row({ feeProductId: 3245 })] });
    const result = await service.update(1, {
      branchId: 115,
      feeProductId: null,
    });
    expect(result.feeProductId).toBeNull();
  });

  it('leaves the fee link alone when the field is absent', async () => {
    const { service } = makeService({ rows: [row({ feeProductId: 3245 })] });
    const result = await service.update(1, {
      branchId: 115,
      capacity: 40,
    });
    expect(result.feeProductId).toBe(3245);
    expect(result.capacity).toBe(40);
  });
});

describe('SchoolClassService — removing a class', () => {
  it('refuses while children are still in it, and says how many', async () => {
    const { service, deleted } = makeService({
      rows: [row({ code: '3b' })],
      enrolled: 3,
    });
    await expect(service.remove(1, 115)).rejects.toThrow(
      /3 students are enrolled in "3b"/,
    );
    expect(deleted).toHaveLength(0);
  });

  it('reads as one student in the singular', async () => {
    const { service } = makeService({ rows: [row()], enrolled: 1 });
    await expect(service.remove(1, 115)).rejects.toThrow(
      /1 student is enrolled/,
    );
  });

  it('offers INACTIVE as the alternative, because it keeps their records', async () => {
    const { service } = makeService({ rows: [row()], enrolled: 2 });
    await expect(service.remove(1, 115)).rejects.toThrow(
      /set the class inactive/,
    );
  });

  it('deletes an empty class — the only case, a typo being undone', async () => {
    const { service, deleted } = makeService({ rows: [row()], enrolled: 0 });
    await expect(service.remove(1, 115)).resolves.toEqual({
      deleted: true,
      id: 1,
      code: '3a',
    });
    expect(deleted).toHaveLength(1);
  });
});

describe('SchoolClassService — sections of a grade', () => {
  it('refuses a section that names no grade — it could not be grouped', async () => {
    // A stray 'A' has no card to sit under on the board and rolls up to nothing
    // in the fee report, so it is refused at the write rather than rendered.
    const { service } = makeService();
    await expect(
      service.create({ branchId: 115, code: '3aad A', section: 'A' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('files a section under the grade, and beside its siblings in teaching order', async () => {
    // 20 is the last sortOrder in the grade; the next section takes 21, inside
    // the gap the ten-spacing leaves, so the next GRADE still starts at 30.
    const { service, saved } = makeService({
      rows: [
        row({ code: '3aad A', gradeCode: '3aad', section: 'A', sortOrder: 20 }),
      ],
      gradeSibling: row({
        code: '3aad A',
        gradeCode: '3aad',
        section: 'A',
        sortOrder: 20,
      }),
    });
    await service.create({
      branchId: 115,
      code: '3aad B',
      gradeCode: '3aad',
      section: 'B',
    });
    expect(saved[0]).toMatchObject({
      code: '3aad B',
      gradeCode: '3aad',
      section: 'B',
      sortOrder: 21,
    });
  });

  it('spells the grade the way the school already spells it', async () => {
    // Sections are added one at a time, days apart, by whoever is at the desk.
    // 'grade 3' typed the second time must not open a second grade holding one
    // section, which is what the board and the fee roll would then show.
    const { service, saved } = makeService({
      gradeSibling: row({ code: '3aad A', gradeCode: 'Grade 3', section: 'A' }),
    });
    await service.create({
      branchId: 115,
      code: '3aad B',
      gradeCode: 'grade 3',
      section: 'B',
    });
    expect(saved[0].gradeCode).toBe('Grade 3');
  });

  it('refuses a second section A in one grade, and says which class already is it', async () => {
    const { service } = makeService({
      sectionClash: row({ code: '3aad A', gradeCode: '3aad', section: 'A' }),
    });
    await expect(
      service.create({
        branchId: 115,
        code: '3aad Alpha',
        gradeCode: '3aad',
        section: 'A',
      } as any),
    ).rejects.toThrow(/already exists — it is "3aad A"/);
  });

  it('leaves a class sectioned when a PATCH only re-points its fee', async () => {
    // The one way this shape can silently lose data: a fee edit that carries no
    // grade field must not read as "this class has no grade".
    const target = row({
      id: 4,
      code: '3aad A',
      gradeCode: '3aad',
      section: 'A',
    });
    const { service, saved } = makeService({ rows: [target] });
    await service.update(4, { branchId: 115, feeProductId: 3269 });
    expect(saved[0]).toMatchObject({ gradeCode: '3aad', section: 'A' });
  });

  it('un-sections a class when the grade is explicitly cleared', async () => {
    const target = row({
      id: 4,
      code: '3aad',
      gradeCode: '3aad',
      section: 'A',
    });
    const { service, saved } = makeService({ rows: [target] });
    await service.update(4, {
      branchId: 115,
      gradeCode: null,
      section: null,
    });
    expect(saved[0]).toMatchObject({ gradeCode: null, section: null });
  });

  it('lets a class keep its own section letter when it is re-saved', async () => {
    // The clash check must exempt the row being written, or a school could
    // never edit the section it already holds.
    const target = row({
      id: 4,
      code: '3aad A',
      gradeCode: '3aad',
      section: 'A',
    });
    const { service, saved } = makeService({
      rows: [target],
      sectionClash: target,
    });
    await service.update(4, {
      branchId: 115,
      gradeCode: '3aad',
      section: 'A',
    });
    expect(saved[0]).toMatchObject({ gradeCode: '3aad', section: 'A' });
  });
});

describe('SchoolClassService — reordering', () => {
  it('writes the new positions in one request', async () => {
    const a = row({ id: 1, sortOrder: 10 });
    const b = row({ id: 2, code: '3b', sortOrder: 20 });
    const { service, saved } = makeService({ rows: [a, b] });
    await service.reorder({
      branchId: 115,
      order: [
        { id: 2, sortOrder: 10 },
        { id: 1, sortOrder: 20 },
      ],
    });
    expect(saved.map((r: any) => [r.id, r.sortOrder])).toEqual([
      [2, 10],
      [1, 20],
    ]);
  });

  it('skips a stale id instead of failing the whole gesture', async () => {
    // Reordering is a drag. Rejecting it wholesale for one id that has since
    // been deleted would leave the list looking rearranged and stored unchanged.
    const a = row({ id: 1 });
    const { service, saved } = makeService({ rows: [a] });
    await service.reorder({
      branchId: 115,
      order: [
        { id: 1, sortOrder: 30 },
        { id: 404, sortOrder: 40 },
      ],
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].sortOrder).toBe(30);
  });
});
