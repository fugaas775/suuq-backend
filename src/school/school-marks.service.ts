import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from '../pos-sync/entities/pos-suspended-cart.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { isSchoolPupilFolio } from '../pos-sync/school-withdrawal.policy';
import {
  SaveSchoolMarkReportsDto,
  SaveSchoolMarksDto,
  SchoolMarkReportEntryDto,
  SchoolMarkReportSubjectDto,
} from './dto/school-marks.dto';
import {
  SCHOOL_MARK_REPORTS_REFUSED_MESSAGE,
  SCHOOL_MARKS_REFUSED_MESSAGE,
  canEnterMarks,
  canFileMarkReports,
  isScopedToTimetable,
  taughtPairs,
  teachesSubjectIn,
} from './school-marks.policy';
import { SchoolTimetableService } from './school-timetable.service';

const text = (v: unknown) => String(v ?? '').trim();
const fold = (v: unknown) => text(v).toLowerCase();
/** Sums of marks are kept to one decimal, as the school's sheets are. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The comparison key for a mark-sheet header: lowercase, alphanumerics only.
 * The SAME fold as pos-s `normalizeHeader` (shared/delimitedText.js), so the
 * server and the importer agree on which spellings are one assessment.
 */
export function foldHeader(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Assessment names folded to one spelling — a copy of pos-s
 * `MARKS_ASSESSMENT_ALIASES` (features/register/schoolAcademicRecord.js),
 * keyed by {@link foldHeader}. Keep the two in step.
 *
 * A workbook of eleven sheets is eleven people's spelling: the SMAK export
 * carries "Mid 1" beside "Mid-exam 1". Left alone they are two assessments of
 * one exam, and a teacher keying "Mid 1" on the sheet beside an imported
 * "Mid-exam 1" counted the exam twice in the subject's total.
 */
export const MARKS_ASSESSMENT_ALIASES: Record<string, string> = {
  mid1: 'Mid-exam 1',
  midexam1: 'Mid-exam 1',
  midterm1: 'Mid-exam 1',
  final1: 'Final-exam 1',
  finalexam1: 'Final-exam 1',
  mid2: 'Mid-exam 2',
  midexam2: 'Mid-exam 2',
  midterm2: 'Mid-exam 2',
  final2: 'Final-exam 2',
  finalexam2: 'Final-exam 2',
  attendance: 'Attendance',
  ateendance: 'Attendance',
  imtixaan: 'Exam',
  total: 'Total',
  wadarta: 'Total',
  guud: 'Total',
};

/** Assessment names that mean "the subject's own total", folded. */
const TOTAL_ASSESSMENTS = new Set(['total', 'wadarta', 'guud', 'wadartaguud']);

export const TOTAL_ASSESSMENT_REFUSED_MESSAGE =
  "Total is the sum of a subject's assessments; key an assessment such as Mid-exam 1.";

/** The canonical label for an assessment name ("Mid 1" → "Mid-exam 1"). */
export function canonicalAssessment(name: unknown): string {
  const raw = text(name);
  return MARKS_ASSESSMENT_ALIASES[foldHeader(raw)] || raw;
}

export function isTotalAssessment(name: unknown): boolean {
  return TOTAL_ASSESSMENTS.has(foldHeader(name));
}

/**
 * Which assessment a name IS. The folded canonical label — except for a name
 * written wholly outside a–z/0–9 (an Amharic heading), which the header fold
 * empties; that one is compared case-folded instead, or every such heading
 * would collapse into one.
 */
function assessmentKey(name: unknown): string {
  const canonical = canonicalAssessment(name);
  return foldHeader(canonical) || fold(canonical);
}

type Assessment = { name: string; score: number; outOf?: number };
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
export type AcademicRecord = { version: number; reports: Report[] };

/**
 * A stored academic record, read the way both marks routes read it: every
 * report with a term, every subject with a name, every assessment with a
 * name and a numeric score — and an assessment's own `outOf` kept where it
 * carries one. The record shape mirrors pos-s `schoolAcademicRecord.js`.
 */
export function normalizeAcademicRecord(record: unknown): AcademicRecord {
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
            .map((a: any) => {
              const out: Assessment = {
                name: text(a?.name),
                score: Number(a?.score),
              };
              const outOf = Number(a?.outOf);
              if (Number.isFinite(outOf) && outOf > 0) out.outOf = outOf;
              return out;
            })
            .filter((a: Assessment) => a.name && Number.isFinite(a.score)),
        }))
        .filter((s: SubjectRecord) => s.subject),
    }))
    .filter((r: Report) => r.term);
  return { version: 1, reports };
}

/**
 * A subject's out-of, from its assessments: their sum when EVERY one says
 * what it was out of, otherwise `fallback`.
 *
 * Why it is not the sheet's own out-of: a teacher keyed Mid-exam 1 out of 15
 * and the final out of 30, and the subject — which took the LAST sheet's
 * out-of — read 42 of 30: 140 %, a grade A and an inflated rank for a child
 * who had scored 42 of 45. An assessment imported without an out-of (legacy
 * records were marked out of 100 as a whole) leaves the subject's own figure
 * alone rather than guess at it.
 */
function subjectOutOf(assessments: Assessment[], fallback: number): number {
  if (assessments.length && assessments.every((a) => Number(a.outOf) > 0)) {
    return round1(assessments.reduce((sum, a) => sum + Number(a.outOf), 0));
  }
  return fallback;
}

function sortReports(reports: Report[]): AcademicRecord {
  reports.sort((a, b) => b.term.localeCompare(a.term));
  return { version: 1, reports };
}

/**
 * Merge one sheet's score into one pupil's academic record, at the
 * assessment level. Everything else on the record — other subjects, other
 * assessments, the school's own position and remark — is untouched. The
 * subject's `total` is re-derived as the sum of its assessments, which is
 * what the school's mark sheets add up to and what the result sheet ranks by,
 * and its `outOf` from theirs (see {@link subjectOutOf}).
 *
 * The assessment name is folded through the alias table, so "Mid 1" on one
 * sheet and "Mid-exam 1" on another are one assessment, stored under the
 * canonical label. "Total" is refused: the total is derived, and a Total
 * keyed as an assessment would be summed into itself.
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
): AcademicRecord {
  if (isTotalAssessment(assessment)) {
    throw new BadRequestException(TOTAL_ASSESSMENT_REFUSED_MESSAGE);
  }
  const name = canonicalAssessment(assessment);
  const key = assessmentKey(name);
  const { reports } = normalizeAcademicRecord(record);

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
    (a) => assessmentKey(a.name) !== key,
  );
  if (score !== null) {
    subj.assessments.push({
      name,
      score,
      ...(outOf > 0 ? { outOf } : {}),
    });
  }
  subj.outOf = subjectOutOf(subj.assessments, subj.outOf);
  subj.total = subj.assessments.length
    ? round1(subj.assessments.reduce((sum, a) => sum + a.score, 0))
    : null;
  // A subject left with no assessment and no total is not a mark; drop it.
  report.subjects = report.subjects.filter(
    (s) => s.assessments.length || s.total !== null,
  );
  report.recordedAt = recordedAt;
  report.recordedBy = recordedBy;
  if (!report.className) report.className = className;

  return sortReports(reports);
}

/** One subject as the office sent it, made into a stored subject. */
function subjectFromReport(given: SchoolMarkReportSubjectDto): SubjectRecord {
  const assessments: Assessment[] = [];
  for (const a of given.assessments ?? []) {
    if (isTotalAssessment(a?.name)) {
      throw new BadRequestException(TOTAL_ASSESSMENT_REFUSED_MESSAGE);
    }
    const score = Number(a?.score);
    if (!text(a?.name) || !Number.isFinite(score)) continue;
    const name = canonicalAssessment(a.name);
    const key = assessmentKey(name);
    const outOf = Number(a?.outOf);
    // The same exam twice in one subject (Mid 1 and Mid-exam 1) is one
    // assessment; the later spelling wins rather than both being summed.
    const at = assessments.findIndex((x) => assessmentKey(x.name) === key);
    const entry: Assessment = {
      name,
      score,
      ...(Number.isFinite(outOf) && outOf > 0 ? { outOf } : {}),
    };
    if (at >= 0) assessments[at] = entry;
    else assessments.push(entry);
  }
  const givenTotal =
    typeof given.total === 'number' && Number.isFinite(given.total)
      ? given.total
      : null;
  const total =
    givenTotal ??
    (assessments.length
      ? round1(assessments.reduce((sum, a) => sum + a.score, 0))
      : null);
  const outOf =
    Number(given.outOf) > 0
      ? Number(given.outOf)
      : subjectOutOf(assessments, 100);
  return {
    subject: text(given.subject),
    ...(text(given.localName) ? { localName: text(given.localName) } : {}),
    total,
    outOf,
    assessments,
  };
}

/**
 * Apply one office entry — a term of one pupil — to their academic record.
 *
 * `removeTerm` drops the term. Otherwise the term's report is kept or opened,
 * `removeSubjects` are dropped FIRST and then every subject given REPLACES
 * the stored subject of the same (case-folded) name, in its place — so a
 * re-cased subject ("maths" → "Maths") sent as both a removal and a subject
 * survives. Subjects not named are untouched; that is the point of the
 * route. `position` and `remark` are set when the entry carries them (null
 * clears). A report left with nothing in it is removed rather than kept as
 * an empty term on the report card. Exported for the spec.
 */
export function applyMarkReport(
  record: unknown,
  entry: SchoolMarkReportEntryDto,
  {
    className,
    recordedAt,
    recordedBy,
  }: { className: string; recordedAt: string; recordedBy: string },
): AcademicRecord {
  const term = text(entry.term);
  const { reports } = normalizeAcademicRecord(record);
  if (entry.removeTerm) {
    return sortReports(reports.filter((r) => r.term !== term));
  }

  let report = reports.find((r) => r.term === term);
  if (!report) {
    report = {
      term,
      className: text(entry.className) || className,
      position: '',
      remark: '',
      recordedAt,
      recordedBy,
      subjects: [],
    };
    reports.push(report);
  } else if (text(entry.className)) {
    report.className = text(entry.className);
  } else if (!report.className) {
    report.className = className;
  }

  const removing = new Set((entry.removeSubjects ?? []).map((s) => fold(s)));
  if (removing.size) {
    report.subjects = report.subjects.filter(
      (s) => !removing.has(fold(s.subject)),
    );
  }
  for (const given of entry.subjects ?? []) {
    const subject = subjectFromReport(given);
    if (!subject.subject) continue;
    const at = report.subjects.findIndex(
      (s) => fold(s.subject) === fold(subject.subject),
    );
    if (at >= 0) report.subjects[at] = subject;
    else report.subjects.push(subject);
  }
  // A subject with no assessment and no total is not a mark.
  report.subjects = report.subjects.filter(
    (s) => s.assessments.length || s.total !== null,
  );
  if (entry.position !== undefined) report.position = text(entry.position);
  if (entry.remark !== undefined) report.remark = text(entry.remark);
  report.recordedAt = recordedAt;
  report.recordedBy = recordedBy;

  const kept =
    report.subjects.length || report.position || report.remark
      ? reports
      : reports.filter((r) => r !== report);
  return sortReports(kept);
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

  private async whoIs(branchId: number, actorId: number | null) {
    const branch = await this.branches.findOne({
      where: { id: branchId },
      select: { id: true, ownerId: true },
    });
    const assignment =
      actorId != null
        ? await this.assignments.findOne({
            where: { branchId, userId: actorId },
          })
        : null;
    const ownerId = (branch as { ownerId?: number } | null)?.ownerId ?? null;
    return { ownerId, assignment };
  }

  /**
   * The pupils' folios, locked for the write, in id order (two sheets saved
   * at once lock in the same order, so they queue rather than deadlock).
   *
   * Refused by name, before anything is written: a folio not on this branch,
   * one no longer on the roll, one that is not a pupil. Marks are written onto
   * a live pupil only — a withdrawn child's record is history, and writing
   * into it would resurrect nothing but a confusing report card.
   */
  private async lockPupilFolios(
    em: EntityManager,
    branchId: number,
    ids: number[],
  ): Promise<PosSuspendedCart[]> {
    const carts = await em.find(PosSuspendedCart, {
      where: { id: In(ids), branchId },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const byId = new Map(carts.map((c) => [Number(c.id), c]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new NotFoundException(
        `No pupil on this branch for folio ${missing.join(', ')}.`,
      );
    }
    const gone = carts.filter(
      (c) => c.status !== PosSuspendedCartStatus.SUSPENDED,
    );
    if (gone.length) {
      throw new BadRequestException(
        `${gone
          .map(
            (c) =>
              `${text((c.cartSnapshot as any)?.hotelGuestName) || `Folio ${c.id}`} (folio ${c.id})`,
          )
          .join(
            ', ',
          )} ${gone.length === 1 ? 'is' : 'are'} no longer on the roll, so no marks can be written there.`,
      );
    }
    for (const cart of carts) {
      if (!isSchoolPupilFolio(cart)) {
        throw new BadRequestException(`Folio ${cart.id} is not a pupil.`);
      }
    }
    return carts;
  }

  /**
   * Write ONLY the snapshot column, with the rest of the snapshot as it was
   * read under the lock. Never `save(entity)`: TypeORM writes back every
   * column of the entity that differs from what it thinks is stored, and a
   * marks save has no business writing a folio's total, status or metadata —
   * a stale copy of those is exactly how a payment gets undone.
   */
  private async writeRecord(
    em: EntityManager,
    cart: PosSuspendedCart,
    record: AcademicRecord,
  ) {
    const snap = (cart.cartSnapshot ?? {}) as Record<string, unknown>;
    const cartSnapshot: Record<string, any> = {
      ...snap,
      schoolAcademicRecord: record,
    };
    await em.update(PosSuspendedCart, { id: cart.id }, { cartSnapshot });
  }

  async save(
    dto: SaveSchoolMarksDto,
    actor: { id?: number | null; email?: string | null },
  ) {
    const actorId = actor.id ?? null;
    const { ownerId, assignment } = await this.whoIs(dto.branchId, actorId);
    if (!canEnterMarks({ actorId, ownerId, assignment })) {
      throw new ForbiddenException(SCHOOL_MARKS_REFUSED_MESSAGE);
    }

    const term = text(dto.term);
    const subject = text(dto.subject);
    const keyed = text(dto.assessment);
    const outOf = Number(dto.outOf) > 0 ? Number(dto.outOf) : 100;
    if (!term || !subject || !keyed) {
      throw new BadRequestException(
        'A term, a subject and an assessment are required.',
      );
    }
    if (isTotalAssessment(keyed)) {
      throw new BadRequestException(TOTAL_ASSESSMENT_REFUSED_MESSAGE);
    }
    const assessment = canonicalAssessment(keyed);

    const ids = [...new Set(dto.entries.map((e) => Number(e.folioId)))].filter(
      (n) => Number.isFinite(n) && n > 0,
    );

    // The scope: a teacher writes only what their timetable puts them in
    // front of. Resolved once, off the same join `timetable/mine` makes, and
    // BEFORE the transaction — the lock is held only for the write itself.
    let recordedBy = text(actor.email) || `user ${actorId}`;
    let pairs: Set<string> | null = null;
    if (isScopedToTimetable({ actorId, ownerId, assignment })) {
      const mine = await this.timetable.mine(dto.branchId, actorId);
      if (mine.employee?.fullName) recordedBy = mine.employee.fullName;
      pairs = taughtPairs(mine.slots);
    }

    const recordedAt = new Date().toISOString();
    const scoreByFolio = new Map<number, number | null>();
    for (const e of dto.entries) {
      scoreByFolio.set(
        Number(e.folioId),
        e.score === undefined || e.score === null ? null : Number(e.score),
      );
    }

    // Load, merge and write in ONE transaction, the rows locked: a fee
    // payment or a second teacher's sheet that lands meanwhile waits for this
    // one and then merges into its result, instead of both starting from the
    // same copy and the later save erasing the earlier.
    return this.carts.manager.transaction(async (em) => {
      const carts = await this.lockPupilFolios(em, dto.branchId, ids);

      if (pairs) {
        for (const cart of carts) {
          const classCode = (cart.cartSnapshot as any)?.hotelRoomNumber;
          if (!teachesSubjectIn(pairs, classCode, subject)) {
            throw new ForbiddenException(
              `Your timetable does not put you in front of ${text(classCode) || 'this class'} for ${subject}, so you cannot enter its marks.`,
            );
          }
        }
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
        await this.writeRecord(em, cart, next);
        saved += 1;
      }
      return { saved, term, subject, assessment, outOf };
    });
  }

  /**
   * The office's marks writes — a hand correction of a pupil's term, a marks
   * import — merged per SUBJECT under the same lock, touching nothing but the
   * academic record. See {@link applyMarkReport} for the merge and
   * {@link canFileMarkReports} for who may.
   *
   * Replaces the office writing the whole folio snapshot through the register
   * route, which carried a stale copy of the fees along with the marks.
   */
  async saveReports(
    dto: SaveSchoolMarkReportsDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[] | null;
    },
  ) {
    const actorId = actor.id ?? null;
    const { ownerId, assignment } = await this.whoIs(dto.branchId, actorId);
    if (
      !canFileMarkReports({
        actorId,
        ownerId,
        roles: actor.roles ?? null,
        assignment,
      })
    ) {
      throw new ForbiddenException(SCHOOL_MARK_REPORTS_REFUSED_MESSAGE);
    }

    // The name on the report: the staff register's spelling when this login
    // is on it, the account otherwise.
    let recordedBy = text(actor.email) || `user ${actorId}`;
    if (actorId != null) {
      const mine = await this.timetable.mine(dto.branchId, actorId);
      if (mine.employee?.fullName) recordedBy = mine.employee.fullName;
    }
    const recordedAt = new Date().toISOString();

    const entries = dto.entries ?? [];
    const ids = [...new Set(entries.map((e) => Number(e.folioId)))].filter(
      (n) => Number.isFinite(n) && n > 0,
    );
    if (!ids.length) throw new BadRequestException('No pupils named.');

    return this.carts.manager.transaction(async (em) => {
      const carts = await this.lockPupilFolios(em, dto.branchId, ids);

      // Every record is computed before the first one is written, so a
      // refusal anywhere in the batch (a Total keyed as an assessment) leaves
      // every pupil exactly as they were.
      const next = new Map<number, AcademicRecord>();
      for (const cart of carts) {
        const snap = (cart.cartSnapshot ?? {}) as Record<string, unknown>;
        let record: unknown = snap.schoolAcademicRecord;
        for (const entry of entries) {
          if (Number(entry.folioId) !== Number(cart.id)) continue;
          record = applyMarkReport(record, entry, {
            className: text(snap.hotelRoomNumber),
            recordedAt,
            recordedBy,
          });
        }
        next.set(Number(cart.id), record as AcademicRecord);
      }

      const items: Array<{
        folioId: number;
        schoolAcademicRecord: AcademicRecord;
      }> = [];
      for (const cart of carts) {
        const record = next.get(Number(cart.id));
        await this.writeRecord(em, cart, record);
        items.push({ folioId: Number(cart.id), schoolAcademicRecord: record });
      }
      return { saved: items.length, items };
    });
  }
}
