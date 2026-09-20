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
  UpdateSchoolTextbookLoanDto,
} from './dto/school-textbook.dto';

const fold = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
const text = (v: unknown) => String(v ?? '').trim();

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
    if (existing) {
      // Re-listing a title that was taken off brings it back, spelling kept.
      if (!existing.isActive) {
        existing.isActive = true;
        return this.titles.save(existing);
      }
      return existing;
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
        createdByUserId: userId,
      }),
    );
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
    { classCode, folioId }: { classCode?: string; folioId?: number } = {},
  ) {
    const where: Record<string, unknown> = { branchId };
    if (text(classCode)) where.classCode = fold(classCode);
    if (folioId != null) where.folioId = Number(folioId);
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

  /** Per pupil, the books still out or lost — for the roll and a withdrawal. */
  async outstanding(branchId: number) {
    const rows = await this.loans.find({
      where: { branchId, status: In(['ISSUED', 'LOST']) },
    });
    const byFolio: Record<string, { issued: number; lost: number }> = {};
    for (const row of rows) {
      const key = String(row.folioId);
      const entry = byFolio[key] || { issued: 0, lost: 0 };
      if (row.status === 'ISSUED') entry.issued += 1;
      else entry.lost += 1;
      byFolio[key] = entry;
    }
    return { byFolio };
  }
}
