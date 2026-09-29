/* eslint-disable @typescript-eslint/require-await */
/**
 * A memory-backed stand-in for a TypeORM repository, answering the handful
 * of shapes the school-guardian services build: find/findOne/count with a
 * `where` of equalities (and `In(...)`), save (assigning ids), update,
 * delete, remove, and a query builder driven by a row filter over the
 * accumulated parameters. Shared by the guardian, homework and message specs.
 */
const inValues = (v: any) =>
  v && typeof v === 'object' && '_value' in v ? v._value : v;

export const matches = (row: any, where: any) =>
  Object.entries(where || {}).every(([k, v]) => {
    const val = inValues(v);
    if (Array.isArray(val)) {
      return val.some(
        (x) =>
          x === row[k] ||
          (typeof x === 'number' &&
            Number.isFinite(Number(row[k])) &&
            Number(row[k]) === x),
      );
    }
    return (
      row[k] === val || (typeof val === 'number' && Number(row[k]) === val)
    );
  });

export function memRepo<T extends { id?: number }>(
  rows: T[],
  seq = { n: 1000 },
) {
  const repo: any = {
    rows,
    find: async ({ where, order }: any = {}) => {
      let out = rows.filter((r) => matches(r, where));
      if (order) {
        const [[key, dir]] = Object.entries(order);
        out = [...out].sort((a: any, b: any) => {
          const av = a[key] ?? '';
          const bv = b[key] ?? '';
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return String(dir).toUpperCase() === 'DESC' ? -cmp : cmp;
        });
      }
      return out;
    },
    findOne: async ({ where }: any) =>
      rows.find((r) => matches(r, where)) || null,
    count: async ({ where }: any) =>
      rows.filter((r) => matches(r, where)).length,
    create: (p: any) => ({ ...p }),
    save: async (input: any) => {
      const list = Array.isArray(input) ? input : [input];
      for (const row of list) {
        if (!row.id) {
          row.id = seq.n++;
          if (!row.createdAt) row.createdAt = new Date();
          rows.push(row);
        } else {
          const i = rows.findIndex((r) => Number(r.id) === Number(row.id));
          if (i >= 0) rows[i] = row;
          else rows.push(row);
        }
        row.updatedAt = new Date();
      }
      return input;
    },
    update: async (where: any, patch: any) => {
      for (const r of rows) if (matches(r, where)) Object.assign(r, patch);
    },
    delete: async (where: any) => {
      for (let i = rows.length - 1; i >= 0; i -= 1)
        if (matches(rows[i], where)) rows.splice(i, 1);
    },
    remove: async (input: any) => {
      const list = Array.isArray(input) ? input : [input];
      for (const row of list) {
        const i = rows.findIndex((r) => Number(r.id) === Number(row.id));
        if (i >= 0) rows.splice(i, 1);
      }
    },
    manager: {
      transaction: async (fn: any) =>
        fn({ getRepository: (entity: any) => repo.byEntity(entity) }),
    },
    byEntity: (_: any) => repo,
  };
  return repo;
}

/** A query builder over memory rows: the filter reads the accumulated parameters. */
export function qb(
  rows: any[],
  filter: (row: any, params: Record<string, any>) => boolean,
) {
  const params: Record<string, any> = {};
  let order: [string, string] | null = null;
  const b: any = {
    where: (_: string, p?: any) => {
      Object.assign(params, p || {});
      return b;
    },
    andWhere: (_: string, p?: any) => {
      Object.assign(params, p || {});
      return b;
    },
    select: () => b,
    addSelect: () => b,
    orderBy: (col: string, dir = 'ASC') => {
      order = [col.replace(/^[a-z]+\."?|"$/g, ''), dir];
      return b;
    },
    addOrderBy: () => b,
    take: () => b,
    getMany: async () => {
      const out = rows.filter((r) => filter(r, params));
      if (order) {
        const [key, dir] = order;
        out.sort((a, b2) => {
          const av = a[key] ?? '';
          const bv = b2[key] ?? '';
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return dir === 'DESC' ? -cmp : cmp;
        });
      }
      return out;
    },
    getOne: async () => rows.find((r) => filter(r, params)) || null,
    getRawMany: async () => rows.filter((r) => filter(r, params)),
  };
  return b;
}

/** A pupil's record as the till stores it. */
export const pupilFolio = (
  id: number,
  branchId: number,
  over: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
) => ({
  id,
  branchId,
  status: 'SUSPENDED',
  total: 2500,
  label: 'x',
  currency: 'ETB',
  itemCount: 2,
  metadata: meta,
  createdAt: new Date('2026-09-12'),
  updatedAt: new Date('2026-09-12'),
  cartSnapshot: {
    serviceFormat: 'SCHOOL',
    hotelGuestName: `Pupil ${id}`,
    hotelRoomNumber: '3aad',
    schoolAdmissionNo: `SMAG-${id}`,
    schoolGuardianName: 'Cali Xasan',
    hotelGuestPhone: '0915333513',
    cartLines: [],
    ...over,
  },
});

/** A staff-reach service answering from a table: head, or a scoped teacher. */
export function reachStub(
  answer: (actor: any) => {
    head: boolean;
    classes?: string[];
    assigned?: string[];
    pairs?: string[];
    employee?: { id: number; fullName: string } | null;
    name?: string;
  },
) {
  return {
    resolve: async (_branchId: number, actor: any) => {
      const a = answer(actor);
      return {
        head: a.head,
        classes: a.head ? null : new Set(a.classes ?? []),
        assigned: new Set(a.assigned ?? []),
        pairs: new Set(a.pairs ?? []),
        employee: a.employee ?? null,
        name: a.name ?? a.employee?.fullName ?? 'Office',
      };
    },
    reachesClass: (reach: any, classCode: unknown) => {
      if (reach.head || !reach.classes) return true;
      return reach.classes.has(
        String(classCode ?? '')
          .trim()
          .toLowerCase(),
      );
    },
  } as any;
}
