import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ListAttendanceQueryDto,
  MarkAttendanceDto,
  MarkLessonAttendanceDto,
  ReclassAttendanceDto,
} from './attendance.dto';

const errors = (cls: any, body: any) =>
  validateSync(plainToInstance(cls, body) as object);

describe('Attendance DTOs — real days, bounded lists', () => {
  it('takes a register only on a day the calendar has', () => {
    const mark = (date: string) => ({ branchId: 115, date, entries: [] });
    expect(errors(MarkAttendanceDto, mark('2026-09-22'))).toHaveLength(0);
    expect(errors(MarkAttendanceDto, mark('2026-02-30'))).not.toHaveLength(0);
    expect(errors(MarkAttendanceDto, mark('2026-W38-1'))).not.toHaveLength(0);
    expect(
      errors(MarkLessonAttendanceDto, mark('2026-02-30')),
    ).not.toHaveLength(0);
  });

  it('reads a day or a range only when both ends are real days', () => {
    expect(
      errors(ListAttendanceQueryDto, {
        branchId: 115,
        from: '2026-09-11',
        to: '2026-10-10',
      }),
    ).toHaveLength(0);
    expect(
      errors(ListAttendanceQueryDto, { branchId: 115, to: '2026-09-31' }),
    ).not.toHaveLength(0);
    expect(
      errors(ListAttendanceQueryDto, { branchId: 115, date: '2026-W38-1' }),
    ).not.toHaveLength(0);
    expect(errors(ListAttendanceQueryDto, { branchId: 115 })).toHaveLength(0);
  });

  it('accepts onlyIfUnmarked on an entry, as a boolean', () => {
    const body = (flag: unknown) => ({
      branchId: 115,
      date: '2026-09-22',
      entries: [{ subjectRef: '1', status: 'PRESENT', onlyIfUnmarked: flag }],
    });
    expect(errors(MarkAttendanceDto, body(true))).toHaveLength(0);
    expect(errors(MarkAttendanceDto, body('yes'))).not.toHaveLength(0);
  });

  it('caps a split’s pupil list at 2000 refs of 64 characters', () => {
    const reclass = (subjectRefs: string[]) => ({
      branchId: 115,
      from: '3aad',
      to: '3aad B',
      subjectRefs,
    });
    expect(
      errors(ReclassAttendanceDto, reclass(Array(2000).fill('4821'))),
    ).toHaveLength(0);
    expect(
      errors(ReclassAttendanceDto, reclass(Array(2001).fill('4821'))),
    ).not.toHaveLength(0);
    expect(
      errors(ReclassAttendanceDto, reclass(['x'.repeat(65)])),
    ).not.toHaveLength(0);
  });
});
