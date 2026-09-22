import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SchoolTextbookLoan,
  TextbookLoanStatus,
} from './entities/school-textbook-loan.entity';
import { SchoolTextbookTitle } from './entities/school-textbook-title.entity';
import { SchoolTimetableService } from './school-timetable.service';
import {
  CreateSchoolTextbookTitleDto,
  IssueSchoolTextbooksDto,
  MarkSchoolTextbookLoanBilledDto,
  UnbillSchoolTextbookLoanDto,
  UpdateSchoolTextbookLoanDto,
  UpdateSchoolTextbookTitleDto,
} from './dto/school-textbook.dto';

/**
 * A teacher's class scope, resolved by the controller; absent = unscoped.
 * `assertPupils` refuses folio ids that are not pupils of this branch sitting
 * in the named class — the controller always supplies it, for the office too.
 */
type ClassScopeCheck =
  | {
      assert: (classCode: unknown) => void;
      assertPupils?: (
        classCode: string,
        folioIds: number[],
      ) => Promise<void> | void;
    }
  | null
  | undefined;

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
const text = (v: unknown) => String(v ?? '').trim();
/** A price, to the cent, or null for "not priced". */
const money = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The textbook register: the titles a class carries, and who holds which.
 *
 * Every class code is LOWERCASED on the way in, like every SCHOOL reader keys
 * one, and every title is matched case-insensitively — a teacher who types
 * "maths grade 3" and one who types "Maths Grade 3" mean the same book.
 */
@Injectable()
export class SchoolTextbookService {
  constructor(
    @InjectRepository(SchoolTextbookTitle)
    private readonly titles: Repository<SchoolTextbookTitle>,
    @InjectRepository(SchoolTextbookLoan)
    private readonly loans: Repository<SchoolTextbookLoan>,
    // The subjects a class is taught — the timetable is the school's own list.
    private readonly timetable?: SchoolTimetableService,
  ) {}

  /**
   * The subjects taught in each class, off the timetable, spelled as the
   * timetable spells them (first spelling wins), keyed by lowercased class.
   * Owner 2026-09-20: "Subjects are those our teachers teach and they are in
   * the timetable, so make it easy to manage Textbooks."
   */
  async subjectsByClass(branchId: number): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!this.timetable) return out;
    const doc = await this.timetable.get(branchId);
    for (const slot of doc?.slots ?? []) {
      const cls = fold(slot?.classCode);
      const subject = text(slot?.subject);
      if (!cls || !subject) continue;
      const list = out.get(cls) ?? [];
      if (!list.some((s) => fold(s) === fold(subject))) list.push(subject);
      out.set(cls, list);
    }
    return out;
  }

  async subjectsFor(branchId: number, classCode: string) {
    const byClass = await this.subjectsByClass(branchId);
    return {
      classCode: fold(classCode),
      subjects: byClass.get(fold(classCode)) ?? [],
    };
  }

  /**
   * One title per subject the timetable teaches in a class — the book IS the
   * subject until the office renames it — for one class or the whole school.
   * Idempotent: a title already listed (by spelling) is left alone; one taken
   * off the list is brought back. Nobody types "Mathematics" forty times.
   */
  async seedFromTimetable(
    branchId: number,
    classCode: string | null | undefined,
    userId: number | null,
    scope?: ClassScopeCheck,
  ) {
    const byClass = await this.subjectsByClass(branchId);
    const wanted = fold(classCode);
    if (wanted) scope?.assert(wanted);
    const classes = wanted ? [wanted] : [...byClass.keys()];
    let created = 0;
    let existing = 0;
    for (const cls of classes) {
      const subjects = byClass.get(cls) ?? [];

      const listed = await this.titles.find({
        where: { branchId, classCode: cls },
      });
      for (const subject of subjects) {
        const match = listed.find(
          (t) =>
            fold(t.title) === fold(subject) ||
            fold(t.subject) === fold(subject),
        );
        if (match && match.isActive) {
          existing += 1;
          continue;
        }

        await this.createTitle(
          { branchId, classCode: cls, title: subject, subject },
          userId,
        );
        created += 1;
      }
    }
    return { classes: classes.length, created, existing };
  }

  /**
   * The office's view of the whole shelf: every class, every title, its
   * subject and price, and how many copies are out, back or lost — plus the
   * subjects the timetable teaches that have no book yet.
   */
  async summary(branchId: number) {
    const [titles, loans, byClass] = await Promise.all([
      this.titles.find({
        where: { branchId, isActive: true },
        order: { classCode: 'ASC', sortOrder: 'ASC', id: 'ASC' },
      }),
      this.loans.find({ where: { branchId } }),
      this.subjectsByClass(branchId),
    ]);
    const counts = new Map<
      string,
      { issued: number; returned: number; lost: number; lostUnbilled: number }
    >();
    for (const loan of loans) {
      const key = `${fold(loan.classCode)}|${fold(loan.title)}`;
      const row = counts.get(key) ?? {
        issued: 0,
        returned: 0,
        lost: 0,
        lostUnbilled: 0,
      };
      if (loan.status === 'ISSUED') row.issued += 1;
      else if (loan.status === 'RETURNED') row.returned += 1;
      else if (loan.status === 'LOST') {
        row.lost += 1;
        if (!loan.billedLineId) row.lostUnbilled += 1;
      }
      counts.set(key, row);
    }
    const classCodes = new Set<string>([
      ...byClass.keys(),
      ...titles.map((t) => fold(t.classCode)),
    ]);
    const classes = [...classCodes].sort().map((cls) => {
      const rows = titles
        .filter((t) => fold(t.classCode) === cls)
        .map((t) => ({
          id: Number(t.id),
          title: t.title,
          subject: t.subject ?? null,
          replacementPrice: t.replacementPrice ?? null,
          ...(counts.get(`${cls}|${fold(t.title)}`) ?? {
            issued: 0,
            returned: 0,
            lost: 0,
            lostUnbilled: 0,
          }),
        }));
      const subjects = byClass.get(cls) ?? [];
      const missing = subjects.filter(
        (subject) =>
          !rows.some(
            (r) =>
              fold(r.subject) === fold(subject) ||
              fold(r.title) === fold(subject),
          ),
      );
      return {
        classCode: cls,
        subjects,
        titles: rows,
        missingSubjects: missing,
      };
    });
    return { classes };
  }

  async listTitles(branchId: number, classCode?: string) {
    const where: Record<string, unknown> = { branchId, isActive: true };
    if (text(classCode)) where.classCode = fold(classCode);
    const items = await this.titles.find({
      where,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return { items };
  }

  async createTitle(
    dto: CreateSchoolTextbookTitleDto,
    userId: number | null,
    scope?: ClassScopeCheck,
  ) {
    const classCode = fold(dto.classCode);
    const title = text(dto.title);
    if (!classCode) throw new BadRequestException('A class is required.');
    if (!title) throw new BadRequestException('A title is required.');
    scope?.assert(classCode);
    const existing = (
      await this.titles.find({ where: { branchId: dto.branchId, classCode } })
    ).find((row) => fold(row.title) === fold(title));
    const price = money(dto.replacementPrice);
    const subject = text(dto.subject) || null;
    if (existing) {
      // Re-listing a title that was taken off brings it back, spelling kept.
      // A price or a subject given on the way back in is taken; none given
      // keeps the old.
      let dirty = false;
      if (!existing.isActive) {
        existing.isActive = true;
        dirty = true;
      }
      if (price != null && existing.replacementPrice !== price) {
        existing.replacementPrice = price;
        dirty = true;
      }
      if (subject && fold(existing.subject) !== fold(subject)) {
        existing.subject = subject;
        dirty = true;
      }
      return dirty ? this.titles.save(existing) : existing;
    }
    const count = await this.titles.count({
      where: { branchId: dto.branchId, classCode },
    });
    return this.titles.save(
      this.titles.create({
        branchId: dto.branchId,
        classCode,
        title,
        sortOrder: count,
        isActive: true,
        replacementPrice: price,
        subject,
        createdByUserId: userId,
      }),
    );
  }

  /**
   * Rename a title, or price it. The rename is refused when another live
   * title in the class already carries the new spelling — two rows for one
   * book is the confusion the unique index exists to prevent — and loans keep
   * their own copy of the title, so a rename changes the list, not history.
   */
  async updateTitle(
    id: number,
    dto: UpdateSchoolTextbookTitleDto,
    scope?: ClassScopeCheck,
  ) {
    const row = await this.titles.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Textbook title ${id} not found.`);
    scope?.assert(row.classCode);
    if (dto.title !== undefined) {
      const title = text(dto.title);
      if (!title) throw new BadRequestException('A title is required.');
      if (fold(title) !== fold(row.title)) {
        const clash = (
          await this.titles.find({
            where: { branchId: dto.branchId, classCode: row.classCode },
          })
        ).find(
          (t) => Number(t.id) !== Number(id) && fold(t.title) === fold(title),
        );
        if (clash)
          throw new BadRequestException(
            `${row.classCode} already lists "${clash.title}".`,
          );
      }
      row.title = title;
    }
    if (dto.replacementPrice !== undefined) {
      row.replacementPrice =
        dto.replacementPrice === null ? null : money(dto.replacementPrice);
    }
    if (dto.subject !== undefined) {
      row.subject = dto.subject === null ? null : text(dto.subject) || null;
    }
    return this.titles.save(row);
  }

  async deactivateTitle(id: number, branchId: number, scope?: ClassScopeCheck) {
    const row = await this.titles.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException(`Textbook title ${id} not found.`);
    scope?.assert(row.classCode);
    row.isActive = false;
    await this.titles.save(row);
    return { deactivated: true, id: Number(row.id) };
  }

  async listLoans(
    branchId: number,
    {
      classCode,
      folioId,
      status,
    }: { classCode?: string; folioId?: number; status?: string } = {},
  ) {
    const where: Record<string, unknown> = { branchId };
    if (text(classCode)) where.classCode = fold(classCode);
    if (folioId != null) where.folioId = Number(folioId);
    if (text(status)) where.status = text(status).toUpperCase();
    const items = await this.loans.find({
      where,
      order: { classCode: 'ASC', title: 'ASC', folioId: 'ASC' },
    });
    return { items };
  }

  /**
   * Issue one title to a set of pupils. One row per (pupil, title): a pupil
   * who returned the book and is issued it again gets the same row back to
   * ISSUED with a fresh date, so the register never holds two answers for one
   * book.
   */
  async issue(
    dto: IssueSchoolTextbooksDto,
    userId: number | null,
    scope?: ClassScopeCheck,
  ) {
    const classCode = fold(dto.classCode);
    const title = text(dto.title);
    if (!classCode) throw new BadRequestException('A class is required.');
    if (!title) throw new BadRequestException('A title is required.');
    scope?.assert(classCode);
    const folioIds = [...new Set(dto.folioIds.map(Number))].filter(
      (n) => Number.isFinite(n) && n > 0,
    );
    if (!folioIds.length) throw new BadRequestException('No pupils named.');
    // Every id a pupil of THIS school sitting in THIS class, refused by name
    // before a row is written. A loan keyed to a folio of another branch (or
    // to a pupil of another class, from a sheet that kept its ticks across a
    // class switch) is a book the register can never collect or bill.
    if (scope?.assertPupils) await scope.assertPupils(classCode, folioIds);
    const issuedAt = dto.issuedAt || today();

    const existing = await this.loans.find({
      where: { branchId: dto.branchId, folioId: In(folioIds) },
    });
    const byFolio = new Map<number, SchoolTextbookLoan>();
    for (const row of existing) {
      if (fold(row.title) === fold(title))
        byFolio.set(Number(row.folioId), row);
    }
    // Re-issuing moves an existing loan row into this class, so the class it
    // sits in now must be the teacher's too — otherwise issuing "Maths" in
    // 3aad would quietly pull another class's loan (and its history) across.
    for (const row of byFolio.values()) {
      if (fold(row.classCode) !== classCode) scope?.assert(row.classCode);
    }

    const rows: SchoolTextbookLoan[] = [];
    for (const folioId of folioIds) {
      const row = byFolio.get(folioId);
      if (row) {
        // A lost copy that was billed, issued again, is a NEW copy and a new
        // loan: the register's memory of the old bill is cleared so the new
        // book can be lost and billed in its turn. The old loss stays billed
        // where the money is — the LOST_BOOK line on the pupil's folio —
        // because a replacement handed out does not un-lose the first book.
        if (row.status === 'LOST' && row.billedLineId) {
          row.billedAt = null;
          row.billedAmount = null;
          row.billedLineId = null;
        }
        row.status = 'ISSUED';
        row.issuedAt = issuedAt;
        row.returnedAt = null;
        row.classCode = classCode;
        row.updatedByUserId = userId;
        rows.push(row);
      } else {
        rows.push(
          this.loans.create({
            branchId: dto.branchId,
            folioId,
            classCode,
            title,
            status: 'ISSUED',
            issuedAt,
            returnedAt: null,
            note: null,
            issuedByUserId: userId,
            updatedByUserId: userId,
          }),
        );
      }
    }
    const saved = await this.loans.save(rows);
    return { issued: saved.length, items: saved };
  }

  async updateLoan(
    id: number,
    dto: UpdateSchoolTextbookLoanDto,
    userId: number | null,
    scope?: ClassScopeCheck,
  ) {
    const row = await this.loans.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Textbook loan ${id} not found.`);
    scope?.assert(row.classCode);
    const status = String(dto.status).toUpperCase() as TextbookLoanStatus;
    // A billed loss is money on the pupil's fees. Filing the book found (or
    // back out) from the register would leave that charge standing on a book
    // the register says was never lost — the family pays for a book the
    // school has. The office reverses the charge first (unbill, below).
    if (row.status === 'LOST' && row.billedLineId && status !== 'LOST') {
      throw new ConflictException({
        code: 'LOST_BOOK_BILLED',
        message: `This book was billed ${row.billedAmount ?? 0} on ${row.billedAt ?? 'the folio'}. The office takes the charge off the pupil's fees first, then files it found.`,
      });
    }
    row.status = status;
    if (status === 'RETURNED') row.returnedAt = today();
    else if (status === 'ISSUED') {
      row.returnedAt = null;
      row.issuedAt = today();
    } else row.returnedAt = null; // LOST: never came back
    if (dto.note !== undefined) row.note = text(dto.note) || null;
    row.updatedByUserId = userId;
    return this.loans.save(row);
  }

  /**
   * The office has billed a lost book. The folio line is the money; this
   * records the day, the amount and the line, so the desk stops offering the
   * book and a second clerk cannot bill it again. Only a LOST book is billed
   * — a book still out is not owed, and a returned one is not either.
   */
  async markBilled(
    id: number,
    dto: MarkSchoolTextbookLoanBilledDto,
    userId: number | null,
  ) {
    const row = await this.loans.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Textbook loan ${id} not found.`);
    if (row.status !== 'LOST')
      throw new BadRequestException('Only a lost book is billed.');
    const lineId = text(dto.lineId);
    if (row.billedLineId && row.billedLineId !== lineId)
      throw new BadRequestException(
        `This book was already billed on ${row.billedAt ?? 'the folio'}.`,
      );
    row.billedAt = row.billedAt ?? today();
    row.billedAmount = money(dto.amount) ?? 0;
    row.billedLineId = lineId;
    row.updatedByUserId = userId;
    return this.loans.save(row);
  }

  /**
   * A billed lost book that turned up. The office has taken the charge off
   * the pupil's folio (the money moved through the register's own folio
   * write); this clears the register's memory of the bill and files the book
   * returned today. Only a LOST book: anything else was never billed.
   */
  async unbill(
    id: number,
    dto: UnbillSchoolTextbookLoanDto,
    userId: number | null,
  ) {
    const row = await this.loans.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Textbook loan ${id} not found.`);
    if (row.status !== 'LOST')
      throw new BadRequestException(
        'Only a lost book is unbilled — this one is not lost.',
      );
    row.billedAt = null;
    row.billedAmount = null;
    row.billedLineId = null;
    row.status = 'RETURNED';
    row.returnedAt = today();
    row.updatedByUserId = userId;
    return this.loans.save(row);
  }

  /**
   * Per pupil, the books still out or lost — for the roll and a withdrawal —
   * and how many of the lost ones the office has not yet billed.
   */
  async outstanding(branchId: number) {
    const rows = await this.loans.find({
      where: { branchId, status: In(['ISSUED', 'LOST']) },
    });
    const byFolio: Record<
      string,
      { issued: number; lost: number; lostUnbilled: number }
    > = {};
    for (const row of rows) {
      const key = String(row.folioId);
      const entry = byFolio[key] || { issued: 0, lost: 0, lostUnbilled: 0 };
      if (row.status === 'ISSUED') entry.issued += 1;
      else {
        entry.lost += 1;
        if (!row.billedLineId) entry.lostUnbilled += 1;
      }
      byFolio[key] = entry;
    }
    return { byFolio };
  }
}
