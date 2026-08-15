import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from '../pos-sync/entities/pos-suspended-cart.entity';
import { SchoolClass, SchoolClassStatus } from './entities/school-class.entity';
import {
  CreateSchoolClassDto,
  ListSchoolClassesQueryDto,
  ReorderSchoolClassesDto,
  UpdateSchoolClassDto,
} from './dto/school-class.dto';

/**
 * The branch's class registry.
 *
 * See {@link SchoolClass} for why this exists at all rather than living in a
 * product attribute. The one rule worth restating here: a class code is
 * compared CASE-INSENSITIVELY within a branch. The register keys folios,
 * tuition lines and roster-import dedupe on the lowercased code, so a school
 * that adds "3A" when "3a" exists has created a collision the rest of the system
 * cannot see — two classes on the board, one set of pupils, and a fee that
 * depends on which row was read last.
 */
@Injectable()
export class SchoolClassService {
  constructor(
    @InjectRepository(SchoolClass)
    private readonly repo: Repository<SchoolClass>,
    @InjectRepository(PosSuspendedCart)
    private readonly cartRepo: Repository<PosSuspendedCart>,
  ) {}

  private toResponse(row: SchoolClass) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      code: row.code,
      name: row.name ?? null,
      sortOrder: row.sortOrder ?? 0,
      feeProductId: row.feeProductId ?? null,
      capacity: row.capacity ?? null,
      status: row.status,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** The row for a code, matched the way the register matches it. */
  private async findByCode(branchId: number, code: string) {
    const wanted = String(code || '').trim();
    if (!wanted) return null;
    return this.repo
      .createQueryBuilder('c')
      .where('c."branchId" = :branchId', { branchId })
      .andWhere('LOWER(c.code) = LOWER(:code)', { code: wanted })
      .getOne();
  }

  async list(query: ListSchoolClassesQueryDto) {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c."branchId" = :branchId', { branchId: query.branchId });

    const status = String(query.status || '')
      .trim()
      .toUpperCase();
    if (
      status &&
      Object.values(SchoolClassStatus).includes(status as SchoolClassStatus)
    ) {
      qb.andWhere('c.status = :status', { status });
    }

    // Teaching order first, then code — a school reads KG before Grade 1, and
    // sorting by code alone puts '10th' before '1aad' before '2aad'.
    const rows = await qb
      .orderBy('c."sortOrder"', 'ASC')
      .addOrderBy('c.code', 'ASC')
      .take(500)
      .getMany();
    return { items: rows.map((r) => this.toResponse(r)) };
  }

  async create(dto: CreateSchoolClassDto) {
    const code = String(dto.code || '').trim();
    const clash = await this.findByCode(dto.branchId, code);
    if (clash) {
      throw new ConflictException(
        `Class "${clash.code}" already exists for this branch.`,
      );
    }

    const status = String(dto.status || '')
      .trim()
      .toUpperCase();
    const row = this.repo.create({
      branchId: dto.branchId,
      code,
      name: dto.name ? String(dto.name).trim() : null,
      // Appended to the end when unstated, so classes created one at a time
      // arrive in the order they were typed rather than all at 0.
      sortOrder: dto.sortOrder ?? (await this.nextSortOrder(dto.branchId)),
      feeProductId: dto.feeProductId ?? null,
      capacity: dto.capacity ?? null,
      status:
        status === SchoolClassStatus.INACTIVE
          ? SchoolClassStatus.INACTIVE
          : SchoolClassStatus.ACTIVE,
    });
    return this.toResponse(await this.repo.save(row));
  }

  private async nextSortOrder(branchId: number) {
    const last = await this.repo
      .createQueryBuilder('c')
      .select('MAX(c."sortOrder")', 'max')
      .where('c."branchId" = :branchId', { branchId })
      .getRawOne<{ max: number | null }>();
    return Number(last?.max ?? -10) + 10;
  }

  async update(id: number, dto: UpdateSchoolClassDto) {
    const row = await this.repo.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException('Class not found for this branch.');

    if (dto.code !== undefined) {
      const code = String(dto.code).trim();
      const clash = await this.findByCode(dto.branchId, code);
      if (clash && Number(clash.id) !== Number(row.id)) {
        throw new ConflictException(
          `Class "${clash.code}" already exists for this branch.`,
        );
      }
      row.code = code;
    }

    if (dto.name !== undefined) {
      row.name = dto.name ? String(dto.name).trim() : null;
    }
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    // Explicit null clears the link — a class can be un-priced again, which is
    // what happens when the fee product it named is retired.
    if (dto.feeProductId !== undefined) {
      row.feeProductId = dto.feeProductId ?? null;
    }
    if (dto.capacity !== undefined) row.capacity = dto.capacity ?? null;
    if (dto.status !== undefined) {
      const status = String(dto.status).trim().toUpperCase();
      if (
        Object.values(SchoolClassStatus).includes(status as SchoolClassStatus)
      ) {
        row.status = status as SchoolClassStatus;
      }
    }

    return this.toResponse(await this.repo.save(row));
  }

  async reorder(dto: ReorderSchoolClassesDto) {
    const ids = dto.order.map((entry) => Number(entry.id));
    const rows = await this.repo
      .createQueryBuilder('c')
      .where('c."branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('c.id IN (:...ids)', { ids: ids.length ? ids : [0] })
      .getMany();

    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const touched: SchoolClass[] = [];
    for (const entry of dto.order) {
      const row = byId.get(Number(entry.id));
      // A row from another branch is skipped rather than 404ing the whole
      // gesture: reordering is a drag, and failing it wholesale for one stale id
      // would leave the list looking rearranged and stored unchanged.
      if (!row) continue;
      row.sortOrder = entry.sortOrder;
      touched.push(row);
    }
    if (touched.length) await this.repo.save(touched);
    return this.list({ branchId: dto.branchId });
  }

  /**
   * How many live student folios sit in a class.
   *
   * Mirrors the frontend's `isLiveStudentFolio`: a voided folio is not an
   * enrolled pupil. Used to refuse a delete that would strand children.
   */
  async countEnrolled(branchId: number, code: string) {
    return this.cartRepo
      .createQueryBuilder('c')
      .where('c."branchId" = :branchId', { branchId })
      .andWhere('c.status = :status', {
        status: PosSuspendedCartStatus.SUSPENDED,
      })
      .andWhere(`LOWER(c."cartSnapshot"->>'hotelRoomNumber') = LOWER(:code)`, {
        code,
      })
      .andWhere(`COALESCE(c."cartSnapshot"->>'paid', '') <> 'voided'`)
      .getCount();
  }

  /**
   * Remove a class outright — only ever a typo being undone.
   *
   * Refused the moment a pupil is in it, and the message says how many, because
   * the alternative to refusing is a roll of children whose class no longer
   * exists: their folios keep the code, the board shows it as "not in the
   * registry", and nothing can price or bill them. A school that has stopped
   * running a grade wants INACTIVE, which keeps the record and the history.
   */
  async remove(id: number, branchId: number) {
    const row = await this.repo.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException('Class not found for this branch.');

    const enrolled = await this.countEnrolled(branchId, row.code);
    if (enrolled > 0) {
      throw new ConflictException(
        `${enrolled} student${enrolled === 1 ? ' is' : 's are'} enrolled in "${row.code}". Move them first, or set the class inactive to stop new enrolments while keeping their records.`,
      );
    }

    await this.repo.delete({ id: row.id });
    return { deleted: true, id: Number(row.id), code: row.code };
  }
}
