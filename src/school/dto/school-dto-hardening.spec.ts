import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ReorderSchoolClassesDto } from './school-class.dto';
import {
  ListSchoolLessonPlansQueryDto,
  SaveSchoolLessonPlanDto,
  SetSchoolLessonPlanStatusDto,
} from './school-lesson-plan.dto';
import { SaveSchoolMarkReportsDto } from './school-marks.dto';
import {
  IssueSchoolTextbooksDto,
  UnbillSchoolTextbookLoanDto,
} from './school-textbook.dto';

/**
 * Every body a SCHOOL route takes is bounded, and every day it names is a
 * day the calendar has — refused at the door with a 400, never a 500 from
 * Postgres or a register filed under a day nobody can pick again.
 */
const errors = (cls: any, body: any) =>
  validateSync(plainToInstance(cls, body) as object);

describe('SCHOOL DTOs — bounded bodies and real days', () => {
  it('caps a class reorder at 500 entries', () => {
    const order = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: i + 1, sortOrder: i }));
    expect(
      errors(ReorderSchoolClassesDto, { branchId: 1, order: order(500) }),
    ).toHaveLength(0);
    expect(
      errors(ReorderSchoolClassesDto, { branchId: 1, order: order(501) }),
    ).not.toHaveLength(0);
  });

  it('takes a lesson plan only on a real day', () => {
    const plan = (lessonDate: string) => ({
      branchId: 1,
      lessonDate,
      periodCode: 'P1',
      classCode: '3aad',
      subject: 'Maths',
      topic: 'Fractions',
    });
    expect(errors(SaveSchoolLessonPlanDto, plan('2026-09-22'))).toHaveLength(0);
    expect(
      errors(SaveSchoolLessonPlanDto, plan('2026-02-30')),
    ).not.toHaveLength(0);
    expect(
      errors(SaveSchoolLessonPlanDto, plan('2026-W38-1')),
    ).not.toHaveLength(0);
    expect(
      errors(ListSchoolLessonPlansQueryDto, {
        branchId: 1,
        from: '2026-09-01',
        to: '2026-09-31',
      }),
    ).not.toHaveLength(0);
    expect(
      errors(SetSchoolLessonPlanStatusDto, {
        branchId: 1,
        status: 'TAUGHT',
        taughtOn: '2026-13-01',
      }),
    ).not.toHaveLength(0);
  });

  it('issues a book only on a real day', () => {
    const issue = (issuedAt?: string) => ({
      branchId: 1,
      classCode: '3aad',
      title: 'Maths',
      folioIds: [1],
      ...(issuedAt ? { issuedAt } : {}),
    });
    expect(errors(IssueSchoolTextbooksDto, issue())).toHaveLength(0);
    expect(errors(IssueSchoolTextbooksDto, issue('2026-09-22'))).toHaveLength(
      0,
    );
    expect(
      errors(IssueSchoolTextbooksDto, issue('2026-02-29')),
    ).not.toHaveLength(0);
    expect(errors(UnbillSchoolTextbookLoanDto, { branchId: 1 })).toHaveLength(
      0,
    );
  });

  it('bounds an office marks write at every level', () => {
    const entry = (over: any = {}) => ({
      folioId: 1,
      term: '2019-S1',
      ...over,
    });
    const body = (entries: any[]) => ({ branchId: 1, entries });
    expect(errors(SaveSchoolMarkReportsDto, body([entry()]))).toHaveLength(0);
    expect(errors(SaveSchoolMarkReportsDto, body([]))).not.toHaveLength(0);
    expect(
      errors(
        SaveSchoolMarkReportsDto,
        body(Array.from({ length: 501 }, () => entry())),
      ),
    ).not.toHaveLength(0);
    const subjects = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ subject: `S${i}` }));
    expect(
      errors(
        SaveSchoolMarkReportsDto,
        body([entry({ subjects: subjects(40) })]),
      ),
    ).toHaveLength(0);
    expect(
      errors(
        SaveSchoolMarkReportsDto,
        body([entry({ subjects: subjects(41) })]),
      ),
    ).not.toHaveLength(0);
    const assessments = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `A${i}`, score: 1 }));
    expect(
      errors(
        SaveSchoolMarkReportsDto,
        body([
          entry({ subjects: [{ subject: 'M', assessments: assessments(21) }] }),
        ]),
      ),
    ).not.toHaveLength(0);
    for (const bad of [
      { term: '' },
      { term: 'x'.repeat(33) },
      { position: 'x'.repeat(41) },
      { remark: 'x'.repeat(501) },
      { removeSubjects: ['x'.repeat(121)] },
      { subjects: [{ subject: 'M', total: 1001 }] },
      { subjects: [{ subject: 'M', outOf: 0 }] },
      { subjects: [{ subject: 'M', assessments: [{ name: 'A', score: -1 }] }] },
      {
        subjects: [
          { subject: 'M', assessments: [{ name: 'A', score: 1, outOf: 0 }] },
        ],
      },
    ]) {
      expect(
        errors(SaveSchoolMarkReportsDto, body([entry(bad)])),
      ).not.toHaveLength(0);
    }
    // null is "clear" for total, position and remark.
    expect(
      errors(
        SaveSchoolMarkReportsDto,
        body([
          entry({
            position: null,
            remark: null,
            subjects: [{ subject: 'M', total: null }],
          }),
        ]),
      ),
    ).toHaveLength(0);
  });
});
