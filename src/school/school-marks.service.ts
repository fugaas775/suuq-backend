import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { isSchoolPupilFolio } from '../pos-sync/school-withdrawal.policy';
import { SaveSchoolMarksDto } from './dto/school-marks.dto';
import {
  SCHOOL_MARKS_REFUSED_MESSAGE,
  canEnterMarks,
  isScopedToTimetable,
  taughtPairs,
  teachesSubjectIn,
} from './school-marks.policy';
import { SchoolTimetableService } from './school-timetable.service';

const text = (v: unknown) => String(v ?? '').trim();
const fold = (v: unknown) => text(v).toLowerCase();

type Assessment = { name: string; score: number };
type SubjectRecord = {
  subject: string;
  localName?: string;
  total: number | null;
  outOf: number;
  assessments: Assessment[];
};
type Report = {
  term: string;
  className: string;
  position: string;
  remark: string;
  recordedAt: string;
  recordedBy: string;
  subjects: SubjectRecord[];
};

/**
 * Merge one sheet's score into one pupil's academic record, at the
 * assessment level. Everything else on the record — other subjects, other
 * assessments, the school's own position and remark — is untouched. The
 * subject's `total` is re-derived as the sum of its assessments, which is
 * what the school's mark sheets add up to and what the result sheet ranks by.
 * Exported for the spec; the record shape mirrors pos-s
 * `schoolAcademicRecord.js`.
 */
export function mergeMark(
  record: unknown,
  {
    term,
    className,
    subject,
    assessment,
    outOf,
    score,
    recordedAt,
    recordedBy,
  }: {
    term: string;
    className: string;
    subject: string;
    assessment: string;
    outOf: number;
    score: number | null;
    recordedAt: string;
    recordedBy: string;
  },
): { version: number; reports: Report[] } {
  const raw = (record ?? {}) as { reports?: unknown };
  const reports: Report[] = (Array.isArray(raw.reports) ? raw.reports : [])
    .map((r: any) => ({
      term: text(r?.term),
      className: text(r?.className),
      position: text(r?.position),
      remark: text(r?.remark),
      recordedAt: text(r?.recordedAt),
      recordedBy: text(r?.recordedBy),
      subjects: (Array.isArray(r?.subjects) ? r.subjects : [])
        .map((s: any) => ({
          subject: text(s?.subject),
          ...(text(s?.localName) ? { localName: text(s.localName) } : {}),
          total:
            Number.isFinite(Number(s?.total)) &&
            s?.total !== null &&
            s?.total !== undefined
              ? Number(s.total)
              : null,
          outOf: Number(s?.outOf) > 0 ? Number(s.outOf) : 100,
          assessments: (Array.isArray(s?.assessments) ? s.assessments : [])
            .map((a: any) => ({ name: text(a?.name), score: Number(a?.score) }))
            .filter((a: Assessment) => a.name && Number.isFinite(a.score)),
        }))
        .filter((s: SubjectRecord) => s.subject),
    }))
    .filter((r: Report) => r.term);

  let report = reports.find((r) => r.term === term);
  if (!report) {
    report = {
      term,
      className,
      position: '',
      remark: '',
      recordedAt,
      recordedBy,
      subjects: [],
    };
    reports.push(report);
  }
  let subj = report.subjects.find((s) => fold(s.subject) === fold(subject));
  if (!subj) {
    subj = { subject, total: null, outOf, assessments: [] };
    report.subjects.push(subj);
  }
  subj.assessments = subj.assessments.filter(
    (a) => fold(a.name) !== fold(assessment),
  );
  if (score !== null) subj.assessments.push({ name: assessment, score });
  if (outOf > 0) subj.outOf = outOf;
  subj.total = subj.assessments.length
    ? Math.round(subj.assessments.reduce((sum, a) => sum + a.score, 0) * 10) /
      10
    : null;
  // A subject left with no assessment and no total is not a mark; drop it.
  report.subjects = report.subjects.filter(
    (s) => s.assessments.length || s.total !== null,
  );
  report.recordedAt = recordedAt;
  report.recordedBy = recordedBy;
  if (!report.className) report.className = className;

  reports.sort((a, b) => b.term.localeCompare(a.term));
  return { version: 1, reports };
}

@Injectable()
export class SchoolMarksService {
  constructor(
    @InjectRepository(PosSuspendedCart)
    private readonly carts: Repository<PosSuspendedCart>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignments: Repository<BranchStaffAssignment>,
    private readonly timetable: SchoolTimetableService,
  ) {}

  async save(
    dto: SaveSchoolMarksDto,
    actor: { id?: number | null; email?: string | null },
  ) {
    const actorId = actor.id ?? null;
    const branch = await this.branches.findOne({
      where: { id: dto.branchId },
      select: { id: true, ownerId: true },
    });
    const assignment =
      actorId != null
        ? await this.assignments.findOne({
            where: { branchId: dto.branchId, userId: actorId },
          })
        : null;
    const ownerId = (branch as { ownerId?: number } | null)?.ownerId ?? null;
    if (!canEnterMarks({ actorId, ownerId, assignment })) {
      throw new ForbiddenException(SCHOOL_MARKS_REFUSED_MESSAGE);
    }

    const term = text(dto.term);
    const subject = text(dto.subject);
    const assessment = text(dto.assessment);
    const outOf = Number(dto.outOf) > 0 ? Number(dto.outOf) : 100;
    if (!term || !subject || !assessment) {
      throw new BadRequestException(
        'A term, a subject and an assessment are required.',
      );
    }

    const ids = [...new Set(dto.entries.map((e) => Number(e.folioId)))].filter(
      (n) => Number.isFinite(n) && n > 0,
    );
    const carts = await this.carts.find({
      where: { id: In(ids), branchId: dto.branchId },
    });
    const byId = new Map(carts.map((c) => [Number(c.id), c]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new NotFoundException(
        `No pupil on this branch for folio ${missing.join(', ')}.`,
      );
    }
    for (const cart of carts) {
      if (!isSchoolPupilFolio(cart)) {
        throw new BadRequestException(`Folio ${cart.id} is not a pupil.`);
      }
    }

    // The scope: a teacher writes only what their timetable puts them in
    // front of. Resolved once, off the same join `timetable/mine` makes.
    let recordedBy = text(actor.email) || `user ${actorId}`;
    if (isScopedToTimetable({ actorId, ownerId, assignment })) {
      const mine = await this.timetable.mine(dto.branchId, actorId);
      if (mine.employee?.fullName) recordedBy = mine.employee.fullName;
      const pairs = taughtPairs(mine.slots);
      for (const cart of carts) {
        const classCode = (cart.cartSnapshot as any)?.hotelRoomNumber;
        if (!teachesSubjectIn(pairs, classCode, subject)) {
          throw new ForbiddenException(
            `Your timetable does not put you in front of ${text(classCode) || 'this class'} for ${subject}, so you cannot enter its marks.`,
          );
        }
      }
    }

    const recordedAt = new Date().toISOString();
    const scoreByFolio = new Map<number, number | null>();
    for (const e of dto.entries) {
      scoreByFolio.set(
        Number(e.folioId),
        e.score === undefined || e.score === null ? null : Number(e.score),
      );
    }
    // A score above the sheet's own out-of is a typo, not a mark — 87 keyed
    // into a sheet out of 30 would rank a child first in the class. Refused
    // by name, BEFORE any folio is written, so a sheet is all-or-nothing.
    const over = carts
      .filter((c) => (scoreByFolio.get(Number(c.id)) ?? 0) > outOf)
      .map(
        (c) =>
          `${text((c.cartSnapshot as any)?.hotelGuestName) || `folio ${c.id}`} (${scoreByFolio.get(Number(c.id))})`,
      );
    if (over.length) {
      throw new BadRequestException(
        `${over.length === 1 ? 'A score is' : `${over.length} scores are`} above ${outOf}, the sheet's out-of: ${over.join(', ')}.`,
      );
    }

    let saved = 0;
    for (const cart of carts) {
      const snap = (cart.cartSnapshot ?? {}) as Record<string, unknown>;
      const next = mergeMark(snap.schoolAcademicRecord, {
        term,
        className: text(snap.hotelRoomNumber),
        subject,
        assessment,
        outOf,
        score: scoreByFolio.get(Number(cart.id)) ?? null,
        recordedAt,
        recordedBy,
      });
      // The WHOLE snapshot back with one key changed — money, dates and
      // lines survive, the same spread the marks importer uses.
      cart.cartSnapshot = { ...snap, schoolAcademicRecord: next } as any;
      await this.carts.save(cart);
      saved += 1;
    }
    return { saved, term, subject, assessment, outOf };
  }
}
