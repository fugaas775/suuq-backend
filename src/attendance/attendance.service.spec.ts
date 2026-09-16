import { BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  AttendanceStatus,
  AttendanceSubjectType,
} from './entities/attendance-mark.entity';

/**
 * The register's rules, all of which are about the difference between "was not
 * there" and "was not recorded" — the distinction the whole feature rests on.
 */

function makeService({
  rows = [] as any[],
  rawMany = [] as any[],
  rawOne = { days: 0 } as any,
  deleteAffected = 0,
  updateAffected = 0,
} = {}) {
  const captured: any = {
    where: [] as Array<[string, any]>,
    inserted: null as any,
    orUpdate: null as any,
    deleted: false,
    updated: null as any,
  };

  const readQb: any = {
    where: (sql: string, params: any) => {
      captured.where.push([sql, params]);
      return readQb;
    },
    andWhere: (sql: string, params: any) => {
      captured.where.push([sql, params]);
      return readQb;
    },
    select: () => readQb,
    addSelect: () => readQb,
    groupBy: () => readQb,
    addGroupBy: () => readQb,
    orderBy: () => readQb,
    addOrderBy: () => readQb,
    take: () => readQb,
    getMany: async () => rows,
    getRawMany: async () => rawMany,
    getRawOne: async () => rawOne,
  };

  const writeQb: any = {
    insert: () => writeQb,
    into: () => writeQb,
    values: (v: any) => {
      captured.inserted = v;
      return writeQb;
    },
    orUpdate: (cols: string[], conflict: string[]) => {
      captured.orUpdate = { cols, conflict };
      return writeQb;
    },
    delete: () => {
      captured.deleted = true;
      return writeQb;
    },
    from: () => writeQb,
    update: () => writeQb,
    set: (v: any) => {
      captured.updated = v;
      return writeQb;
    },
    where: (sql: string, params: any) => {
      captured.where.push([sql, params]);
      return writeQb;
    },
    andWhere: (sql: string, params: any) => {
      captured.where.push([sql, params]);
      return writeQb;
    },
    execute: async () => ({
      affected: captured.deleted ? deleteAffected : updateAffected,
    }),
  };

  const repo: any = {
    createQueryBuilder: (alias?: string) => (alias ? readQb : writeQb),
  };
  // The lesson table gets the same two builders and its own capture, so a
  // test can tell which register a write went to.
  const lessonCaptured: any = {
    where: [],
    inserted: null,
    orUpdate: null,
    deleted: false,
  };
  const lessonReadQb: any = {
    where: (sql: string, params: any) => {
      lessonCaptured.where.push([sql, params]);
      return lessonReadQb;
    },
    andWhere: (sql: string, params: any) => {
      lessonCaptured.where.push([sql, params]);
      return lessonReadQb;
    },
    select: () => lessonReadQb,
    addSelect: () => lessonReadQb,
    groupBy: () => lessonReadQb,
    orderBy: () => lessonReadQb,
    addOrderBy: () => lessonReadQb,
    take: () => lessonReadQb,
    getMany: async () => rows,
    getRawMany: async () => rawMany,
    getRawOne: async () => rawOne,
  };
  const lessonWriteQb: any = {
    insert: () => lessonWriteQb,
    into: () => lessonWriteQb,
    values: (v: any) => {
      lessonCaptured.inserted = v;
      return lessonWriteQb;
    },
    orUpdate: (cols: string[], conflict: string[]) => {
      lessonCaptured.orUpdate = { cols, conflict };
      return lessonWriteQb;
    },
    delete: () => {
      lessonCaptured.deleted = true;
      return lessonWriteQb;
    },
    from: () => lessonWriteQb,
    where: (sql: any, params: any) => {
      lessonCaptured.where.push([sql, params]);
      return lessonWriteQb;
    },
    andWhere: (sql: any, params: any) => {
      lessonCaptured.where.push([sql, params]);
      return lessonWriteQb;
    },
    execute: async () => ({
      affected: lessonCaptured.deleted ? deleteAffected : 0,
    }),
  };
  const lessonRepo: any = {
    createQueryBuilder: (alias?: string) =>
      alias ? lessonReadQb : lessonWriteQb,
  };

  return {
    svc: new AttendanceService(repo, lessonRepo),
    captured,
    lessonCaptured,
  };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({
    branchId: 115,
    date: '2026-08-16',
    classCode: '4aad',
    entries: [],
    ...over,
  }) as any;

describe('AttendanceService', () => {
  describe('mark', () => {
    it('upserts onto the day index so a re-taken register never duplicates', async () => {
      const { svc, captured } = makeService();
      await svc.mark(
        AttendanceSubjectType.STUDENT,
        dto({
          entries: [
            { subjectRef: '10422', status: AttendanceStatus.PRESENT },
            { subjectRef: '10423', status: AttendanceStatus.ABSENT },
          ],
        }),
        7,
      );

      expect(captured.inserted).toHaveLength(2);
      expect(captured.orUpdate.conflict).toEqual([
        'branchId',
        'subjectType',
        'subjectRef',
        'attendanceDate',
      ]);
      // The status has to be in the update set, or correcting a mark would
      // silently do nothing.
      expect(captured.orUpdate.cols).toContain('status');
      expect(captured.orUpdate.cols).toContain('updatedAt');
    });

    it('stores the class code lowercased, as every SCHOOL reader keys on it', async () => {
      const { svc, captured } = makeService();
      await svc.mark(
        AttendanceSubjectType.STUDENT,
        dto({
          classCode: '4AAD',
          entries: [{ subjectRef: '1', status: AttendanceStatus.PRESENT }],
        }),
        null,
      );
      expect(captured.inserted[0].classCode).toBe('4aad');
    });

    it('never puts a class on a staff row', async () => {
      const { svc, captured } = makeService();
      await svc.mark(
        AttendanceSubjectType.STAFF,
        dto({
          classCode: '4aad',
          entries: [{ subjectRef: '9', status: AttendanceStatus.PRESENT }],
        }),
        null,
      );
      expect(captured.inserted[0].classCode).toBeNull();
      expect(captured.inserted[0].subjectType).toBe(
        AttendanceSubjectType.STAFF,
      );
    });

    it('a null status CLEARS the day instead of recording an absence', async () => {
      const { svc, captured } = makeService({ deleteAffected: 1 });
      const result = await svc.mark(
        AttendanceSubjectType.STUDENT,
        dto({ entries: [{ subjectRef: '10422', status: null }] }),
        null,
      );
      expect(captured.inserted).toBeNull();
      expect(captured.deleted).toBe(true);
      expect(result).toMatchObject({ saved: 0, cleared: 1 });
    });

    it('keeps minutesLate only on a LATE row', async () => {
      const { svc, captured } = makeService();
      await svc.mark(
        AttendanceSubjectType.STUDENT,
        dto({
          entries: [
            { subjectRef: '1', status: AttendanceStatus.LATE, minutesLate: 15 },
            // The same child corrected to PRESENT later in the day. Carrying the
            // minutes across would report a punctual pupil as late forever.
            {
              subjectRef: '2',
              status: AttendanceStatus.PRESENT,
              minutesLate: 15,
            },
          ],
        }),
        null,
      );
      expect(captured.inserted[0].minutesLate).toBe(15);
      expect(captured.inserted[1].minutesLate).toBeNull();
    });

    it('takes the last word when one subject appears twice in a submission', async () => {
      const { svc, captured } = makeService();
      await svc.mark(
        AttendanceSubjectType.STUDENT,
        dto({
          entries: [
            { subjectRef: '1', status: AttendanceStatus.PRESENT },
            { subjectRef: '1', status: AttendanceStatus.ABSENT },
          ],
        }),
        null,
      );
      // One row, not two — a duplicated ref would otherwise make the upsert
      // conflict with itself inside a single statement, which Postgres refuses.
      expect(captured.inserted).toHaveLength(1);
    });

    it('refuses a date it cannot read as a day', async () => {
      const { svc } = makeService();
      await expect(
        svc.mark(AttendanceSubjectType.STUDENT, dto({ date: 'today' }), null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('summary', () => {
    it('counts by subject and class, and reports the days taken', async () => {
      const { svc } = makeService({
        rawMany: [
          {
            subjectRef: '10422',
            subjectName: 'Faadumo Cali',
            classCode: '4aad',
            marked: '18',
            present: '15',
            absent: '2',
            late: '1',
            excused: '0',
          },
        ],
        rawOne: { days: 20 },
      });

      const out = await svc.summary(AttendanceSubjectType.STUDENT, {
        branchId: 115,
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(out.days).toBe(20);
      expect(out.items[0]).toEqual({
        subjectRef: '10422',
        // Carried on the row itself, so a month's register can name a pupil who
        // has since left the school.
        subjectName: 'Faadumo Cali',
        classCode: '4aad',
        marked: 18,
        present: 15,
        absent: 2,
        late: 1,
        excused: 0,
      });
    });

    it('reports counts only — the rate has exactly one definition, and it is not here', async () => {
      const { svc } = makeService({
        rawMany: [
          {
            subjectRef: '1',
            subjectName: 'A',
            classCode: '1aad',
            marked: '10',
            present: '9',
            absent: '1',
            late: '0',
            excused: '0',
          },
        ],
        rawOne: { days: 10 },
      });
      const out = await svc.summary(AttendanceSubjectType.STUDENT, {
        branchId: 115,
      });
      expect(out.items[0]).not.toHaveProperty('percent');
      expect(out.items[0]).not.toHaveProperty('rate');
    });
  });

  describe('scoping', () => {
    it('always constrains to the branch and the subject type', async () => {
      const { svc, captured } = makeService();
      await svc.list(AttendanceSubjectType.STAFF, { branchId: 115 });
      const sql = captured.where.map(([s]: [string]) => s).join(' ');
      expect(sql).toContain('"branchId"');
      expect(sql).toContain('"subjectType"');
      expect(
        captured.where.some(
          ([, p]: [string, any]) =>
            p?.subjectType === AttendanceSubjectType.STAFF,
        ),
      ).toBe(true);
    });

    it('treats an exact date and a range as alternatives', async () => {
      const { svc, captured } = makeService();
      await svc.list(AttendanceSubjectType.STUDENT, {
        branchId: 115,
        date: '2026-08-16',
        from: '2026-01-01',
        to: '2026-12-31',
      });
      const sql = captured.where.map(([s]: [string]) => s).join(' ');
      expect(sql).toContain('"attendanceDate" = :exact');
      expect(sql).not.toContain('>= :from');
    });

    it('lowercases the class filter', async () => {
      const { svc, captured } = makeService();
      await svc.list(AttendanceSubjectType.STUDENT, {
        branchId: 115,
        classCode: '4AAD',
      });
      expect(
        captured.where.some(([, p]: [string, any]) => p?.code === '4aad'),
      ).toBe(true);
    });
  });

  describe('reclass', () => {
    it('moves a class register to its new code', async () => {
      const { svc, captured } = makeService({ updateAffected: 812 });
      const out = await svc.reclass({ branchId: 115, from: '3A', to: '3aad' });
      expect(captured.updated).toEqual({ classCode: '3aad' });
      expect(out.updated).toBe(812);
    });

    it('is a no-op when the code has not actually changed', async () => {
      const { svc, captured } = makeService({ updateAffected: 99 });
      const out = await svc.reclass({ branchId: 115, from: '3a', to: '3A' });
      expect(out.updated).toBe(0);
      expect(captured.updated).toBeNull();
    });

    it('only ever touches STUDENT rows', async () => {
      const { svc, captured } = makeService({ updateAffected: 1 });
      await svc.reclass({ branchId: 115, from: '3a', to: '3aad' });
      expect(
        captured.where.some(
          ([, p]: [string, any]) =>
            p?.subjectType === AttendanceSubjectType.STUDENT,
        ),
      ).toBe(true);
    });

    it('moves only the named pupils when a split says which', async () => {
      // Half of 3aad becomes 3aad B; the other half's register must stay put.
      const { svc, captured } = makeService({ updateAffected: 24 });
      await svc.reclass({
        branchId: 115,
        from: '3aad A',
        to: '3aad B',
        subjectRefs: ['4821', '4822'],
      });
      expect(
        captured.where.some(
          ([, p]: [string, any]) =>
            Array.isArray(p?.refs) && p.refs.join() === '4821,4822',
        ),
      ).toBe(true);
    });

    it('treats an empty ref list as "nobody moved", not as "everybody"', async () => {
      const { svc, captured } = makeService({ updateAffected: 812 });
      const out = await svc.reclass({
        branchId: 115,
        from: '3aad A',
        to: '3aad B',
        subjectRefs: [],
      });
      expect(out.updated).toBe(0);
      expect(captured.updated).toBeNull();
    });
  });

  /**
   * The grain below the day: (teacher, day, period, class). Its own table, so
   * nothing here touches the day register's builders.
   */
  describe('lessons', () => {
    const lessonDto = (over: Record<string, unknown> = {}) =>
      ({ branchId: 115, date: '2026-09-16', entries: [], ...over }) as any;

    it('upserts onto the lesson index — a corrected mark is an update, never a second lesson', async () => {
      const { svc, captured, lessonCaptured } = makeService();
      const result = await svc.markLessons(
        AttendanceSubjectType.STAFF,
        lessonDto({
          entries: [
            {
              subjectRef: '5',
              subjectName: 'Temesgen Eshetu',
              periodCode: 'P1',
              classCode: '3AAD',
              subject: 'Amharic',
              status: AttendanceStatus.PRESENT,
            },
            {
              subjectRef: '5',
              periodCode: 'P1',
              classCode: '7th',
              status: AttendanceStatus.ABSENT,
            },
            // The same lesson twice in one request is one lesson.
            {
              subjectRef: '5',
              periodCode: 'p1',
              classCode: '7TH',
              status: AttendanceStatus.PRESENT,
            },
          ],
        }),
        9,
      );
      expect(result).toEqual({ saved: 2, cleared: 0, date: '2026-09-16' });
      expect(lessonCaptured.inserted).toHaveLength(2);
      expect(lessonCaptured.inserted[0]).toMatchObject({
        subjectType: 'STAFF',
        subjectRef: '5',
        periodCode: 'P1',
        classCode: '3aad',
        subject: 'Amharic',
        status: 'PRESENT',
        recordedByUserId: 9,
      });
      expect(lessonCaptured.orUpdate.conflict).toEqual([
        'branchId',
        'subjectType',
        'subjectRef',
        'attendanceDate',
        'periodCode',
        'classCode',
      ]);
      expect(lessonCaptured.orUpdate.cols).toContain('status');
      // The day register was not written.
      expect(captured.inserted).toBeNull();
    });

    it('refuses a lesson that names no class or period — the key would be incomplete', async () => {
      const { svc } = makeService();
      await expect(
        svc.markLessons(
          AttendanceSubjectType.STAFF,
          lessonDto({
            entries: [{ subjectRef: '5', periodCode: 'P1', status: 'PRESENT' }],
          }),
          null,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.markLessons(
          AttendanceSubjectType.STAFF,
          lessonDto({
            entries: [
              { subjectRef: '5', classCode: '3aad', status: 'PRESENT' },
            ],
          }),
          null,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('clears a lesson on a null status instead of marking it, and only that lesson', async () => {
      const { svc, lessonCaptured } = makeService({ deleteAffected: 1 });
      const result = await svc.markLessons(
        AttendanceSubjectType.STAFF,
        lessonDto({
          entries: [
            {
              subjectRef: '5',
              periodCode: 'P1',
              classCode: '3aad',
              status: null,
            },
          ],
        }),
        null,
      );
      expect(result).toEqual({ saved: 0, cleared: 1, date: '2026-09-16' });
      expect(lessonCaptured.inserted).toBeNull();
      expect(lessonCaptured.deleted).toBe(true);
      const sql = lessonCaptured.where
        .map(([w]) => (typeof w === 'string' ? w : 'brackets'))
        .join(' ');
      expect(sql).toContain('"attendanceDate" = :day');
      expect(sql).toContain('brackets');
    });

    it('only stores minutes on a LATE lesson', async () => {
      const { svc, lessonCaptured } = makeService();
      await svc.markLessons(
        AttendanceSubjectType.STAFF,
        lessonDto({
          entries: [
            {
              subjectRef: '5',
              periodCode: 'P1',
              classCode: '3aad',
              status: AttendanceStatus.LATE,
              minutesLate: 10,
            },
            {
              subjectRef: '8',
              periodCode: 'P1',
              classCode: '1aad',
              status: AttendanceStatus.PRESENT,
              minutesLate: 10,
            },
          ],
        }),
        null,
      );
      expect(lessonCaptured.inserted.map((r: any) => r.minutesLate)).toEqual([
        10,
        null,
      ]);
    });

    it('lists and summarises lessons scoped to the day or range asked for', async () => {
      const { svc, lessonCaptured } = makeService({
        rows: [],
        rawMany: [
          {
            subjectRef: '5',
            subjectName: 'Temesgen Eshetu',
            marked: '4',
            present: '3',
            absent: '1',
            late: '0',
            excused: '0',
            days: '2',
          },
        ],
        rawOne: { days: 2 },
      });
      await svc.listLessons(AttendanceSubjectType.STAFF, {
        branchId: 115,
        date: '2026-09-16',
      });
      expect(
        lessonCaptured.where.some(([w]) =>
          String(w).includes('"attendanceDate" = :exact'),
        ),
      ).toBe(true);
      const summary = await svc.summaryLessons(AttendanceSubjectType.STAFF, {
        branchId: 115,
        from: '2026-09-01',
        to: '2026-09-30',
      });
      expect(summary.items).toEqual([
        {
          subjectRef: '5',
          subjectName: 'Temesgen Eshetu',
          marked: 4,
          present: 3,
          absent: 1,
          late: 0,
          excused: 0,
          days: 2,
        },
      ]);
      expect(summary.days).toBe(2);
      // Counts only — no percentage leaves the server.
      expect(Object.keys(summary.items[0])).not.toContain('rate');
    });
  });
});

describe('AttendanceService.rekey — a duplicate pupil’s marks follow the child', () => {
  /**
   * A mark is filed under the folio id. A pupil who reached the roll twice can
   * hold marks under both rows, and discarding the duplicate would orphan its
   * marks. Re-keying moves them; where both rows were marked on one day, the
   * survivor's mark wins and the duplicate's is dropped.
   */
  function makeRepo(deleted = 2, moved = 5) {
    const calls: any[] = [];
    const qb: any = {
      delete: () => {
        calls.push('delete');
        return qb;
      },
      from: () => qb,
      update: () => {
        calls.push('update');
        return qb;
      },
      set: (v: any) => {
        calls.push(['set', v]);
        return qb;
      },
      where: (c: string, p: any) => {
        calls.push(['where', c, p]);
        return qb;
      },
      andWhere: (c: string, p: any) => {
        calls.push(['andWhere', c, p]);
        return qb;
      },
      execute: async () => ({
        affected: calls.includes('update') ? moved : deleted,
      }),
    };
    return { repo: { createQueryBuilder: () => qb } as any, calls };
  }

  it('drops the duplicate’s marks on days the survivor already has one, then moves the rest', async () => {
    const { AttendanceService } = await import('./attendance.service');
    const { repo, calls } = makeRepo(2, 5);
    const svc = new AttendanceService(repo, {} as any);
    const out = await svc.rekey({
      branchId: 128,
      from: '27289',
      to: '27287',
    });
    expect(out).toEqual({ moved: 5, dropped: 2 });
    expect(calls.indexOf('delete')).toBeLessThan(calls.indexOf('update'));
    const set = calls.find((c) => Array.isArray(c) && c[0] === 'set');
    expect(set[1]).toEqual({ subjectRef: '27287' });
    // Only the STUDENT register, only this branch, only that row.
    const wheres = calls.filter(
      (c) => Array.isArray(c) && (c[0] === 'where' || c[0] === 'andWhere'),
    );
    expect(
      wheres.some((c) => String(c[1]).includes('"subjectRef" = :from')),
    ).toBe(true);
    expect(
      wheres.some((c) => String(c[1]).includes('"subjectRef" = :to')),
    ).toBe(true);
  });

  it('refuses a missing side and does nothing for the same id twice', async () => {
    const { AttendanceService } = await import('./attendance.service');
    const { repo, calls } = makeRepo();
    const svc = new AttendanceService(repo, {} as any);
    await expect(
      svc.rekey({ branchId: 128, from: '', to: '1' } as any),
    ).rejects.toThrow(/required/);
    expect(
      await svc.rekey({ branchId: 128, from: '7', to: '7' } as any),
    ).toEqual({ moved: 0, dropped: 0 });
    expect(calls).toEqual([]);
  });
});
