import {
  BadRequestException,
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
import {
  CreateSchoolTextbookTitleDto,
  IssueSchoolTextbooksDto,
  MarkSchoolTextbookLoanBilledDto,
  UpdateSchoolTextbookLoanDto,
  UpdateSchoolTextbookTitleDto,
} from './dto/school-textbook.dto';

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
  ) {}

  async listTitles(branchId: number, classCode?: string) {
    const where: Record<string, unknown> = { branchId, isActive: true };
    if (text(classCode)) where.classCode = fold(classCode);
    const items = await this.titles.find({
      where,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return { items };
  }

  async createTitle(dto: CreateSchoolTextbookTitleDto, userId: number | null) {
    const classCode = fold(dto.classCode);
    const title = text(dto.title);
    if (!classCode) throw new BadRequestException('A class is required.');
    if (!title) throw new BadRequestException('A title is required.');
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
  async updateTitle(id: number, dto: UpdateSchoolTextbookTitleDto) {
    const row = await this.titles.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Textbook title ${id} not found.`);
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

  async deactivateTitle(id: number, branchId: number) {
    const row = await this.titles.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException(`Textbook title ${id} not found.`);
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
  async issue(dto: IssueSchoolTextbooksDto, userId: number | null) {
    const classCode = fold(dto.classCode);
    const title = text(dto.title);
    if (!classCode) throw new BadRequestException('A class is required.');
    if (!title) throw new BadRequestException('A title is required.');
    const folioIds = [...new Set(dto.folioIds.map(Number))].filter(
      (n) => Number.isFinite(n) && n > 0,
    );
    if (!folioIds.length) throw new BadRequestException('No pupils named.');
    const issuedAt = dto.issuedAt || today();

    const existing = await this.loans.find({
      where: { branchId: dto.branchId, folioId: In(folioIds) },
    });
    const byFolio = new Map<number, SchoolTextbookLoan>();
    for (const row of existing) {
      if (fold(row.title) === fold(title))
        byFolio.set(Number(row.folioId), row);
    }

    const rows: SchoolTextbookLoan[] = [];
    for (const folioId of folioIds) {
      const row = byFolio.get(folioId);
      if (row) {
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
  ) {
    const row = await this.loans.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException(`Textbook loan ${id} not found.`);
    const status = String(dto.status).toUpperCase() as TextbookLoanStatus;
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
