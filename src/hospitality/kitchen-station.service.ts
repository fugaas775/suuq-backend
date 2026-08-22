import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  KitchenStation,
  KitchenStationStatus,
} from './entities/kitchen-station.entity';
import {
  CreateKitchenStationDto,
  ListKitchenStationsQueryDto,
  ReorderKitchenStationsDto,
  UpdateKitchenStationDto,
} from './dto/kitchen-station.dto';

/**
 * The branch's kitchen-station registry.
 *
 * See {@link KitchenStation} for why a station is a row rather than a member of
 * a shipped enum. Two rules worth restating where the writes are:
 *
 *  - A code is compared CASE-INSENSITIVELY within a branch, the same rule the
 *    class registry follows, because everything downstream keys on the
 *    uppercased code. "Grill" beside "GRILL" would be two tickets for one pass.
 *  - A code is set ONCE. Renaming a station changes what prints at the head of
 *    the ticket and nothing else; re-deriving the code from the new name would
 *    orphan every category routed to it and silently move that food to the
 *    un-routed ticket.
 */
@Injectable()
export class KitchenStationService {
  constructor(
    @InjectRepository(KitchenStation)
    private readonly repo: Repository<KitchenStation>,
  ) {}

  /**
   * A code from a name the branch typed: 'Juice bar' -> 'JUICE_BAR'.
   *
   * Falls back to a timestamp-free positional code when the name is all
   * punctuation or a script with no A-Z (Amharic, Arabic — both are real here).
   * Uniqueness is settled by the caller, not by making this clever.
   */
  private slugify(name: string) {
    const slug = String(name || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);
    return slug || 'STATION';
  }

  private categoriesOf(row: KitchenStation): string[] {
    const raw = (row.metadata as { categories?: unknown } | null)?.categories;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((c) =>
        String(c || '')
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean);
  }

  private normalizeCategories(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    for (const entry of input) {
      const code = String(entry || '')
        .trim()
        .toUpperCase();
      if (code) seen.add(code);
    }
    return [...seen];
  }

  private toResponse(row: KitchenStation) {
    return {
      id: Number(row.id),
      branchId: row.branchId,
      code: row.code,
      // The ticket head. Never null in the response, so no caller has to repeat
      // the fallback and none of them can disagree about it.
      name: row.name || row.code,
      sortOrder: row.sortOrder ?? 0,
      status: row.status,
      categories: this.categoriesOf(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async findByCode(branchId: number, code: string) {
    const wanted = String(code || '').trim();
    if (!wanted) return null;
    return this.repo
      .createQueryBuilder('s')
      .where('s."branchId" = :branchId', { branchId })
      .andWhere('LOWER(s.code) = LOWER(:code)', { code: wanted })
      .getOne();
  }

  /** Appended to the end, spaced by ten, so a drag has room to land between. */
  private async nextSortOrder(branchId: number) {
    const last = await this.repo
      .createQueryBuilder('s')
      .select('MAX(s."sortOrder")', 'max')
      .where('s."branchId" = :branchId', { branchId })
      .getRawOne<{ max: number | null }>();
    return Number(last?.max ?? -10) + 10;
  }

  async list(query: ListKitchenStationsQueryDto) {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s."branchId" = :branchId', { branchId: query.branchId });

    const status = String(query.status || '')
      .trim()
      .toUpperCase();
    if (
      status &&
      Object.values(KitchenStationStatus).includes(
        status as KitchenStationStatus,
      )
    ) {
      qb.andWhere('s.status = :status', { status });
    }

    const rows = await qb
      .orderBy('s."sortOrder"', 'ASC')
      .addOrderBy('s.code', 'ASC')
      .take(200)
      .getMany();
    return { items: rows.map((r) => this.toResponse(r)) };
  }

  async create(dto: CreateKitchenStationDto) {
    const name = String(dto.name || '').trim();
    // An explicit code is honoured (the seed helper sends one); otherwise it is
    // derived from the name and de-duplicated with a numeric suffix, because two
    // stations called "Juice bar" is a thing a shop does when it has two.
    let code = String(dto.code || '').trim() || this.slugify(name);
    if (await this.findByCode(dto.branchId, code)) {
      if (dto.code) {
        throw new ConflictException(
          `A station with the code "${code}" already exists at this branch.`,
        );
      }
      const base = code.slice(0, 60);
      let suffix = 2;
      while (await this.findByCode(dto.branchId, `${base}_${suffix}`)) {
        suffix += 1;
        if (suffix > 50) break;
      }
      code = `${base}_${suffix}`;
    }

    const status = String(dto.status || '')
      .trim()
      .toUpperCase();
    const row = this.repo.create({
      branchId: dto.branchId,
      code,
      name: name || null,
      sortOrder: dto.sortOrder ?? (await this.nextSortOrder(dto.branchId)),
      status:
        status === KitchenStationStatus.INACTIVE
          ? KitchenStationStatus.INACTIVE
          : KitchenStationStatus.ACTIVE,
      metadata: { categories: this.normalizeCategories(dto.categories) },
    });
    return this.toResponse(await this.repo.save(row));
  }

  async update(id: number, dto: UpdateKitchenStationDto) {
    const row = await this.repo.findOne({
      where: { id, branchId: dto.branchId },
    });
    if (!row) throw new NotFoundException('Station not found for this branch.');

    // Deliberately NOT re-deriving `code` from the new name — see the class
    // docblock. A rename moves the words on the paper, not the routing.
    if (dto.name !== undefined) {
      row.name = String(dto.name).trim() || null;
    }
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    if (dto.categories !== undefined) {
      row.metadata = {
        ...(row.metadata && typeof row.metadata === 'object'
          ? row.metadata
          : {}),
        categories: this.normalizeCategories(dto.categories),
      };
    }
    if (dto.status !== undefined) {
      const status = String(dto.status).trim().toUpperCase();
      if (
        Object.values(KitchenStationStatus).includes(
          status as KitchenStationStatus,
        )
      ) {
        row.status = status as KitchenStationStatus;
      }
    }

    return this.toResponse(await this.repo.save(row));
  }

  async reorder(dto: ReorderKitchenStationsDto) {
    const ids = dto.order.map((entry) => Number(entry.id));
    const rows = await this.repo
      .createQueryBuilder('s')
      .where('s."branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('s.id IN (:...ids)', { ids: ids.length ? ids : [0] })
      .getMany();

    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const touched: KitchenStation[] = [];
    for (const entry of dto.order) {
      const row = byId.get(Number(entry.id));
      // A stale id is skipped rather than failing the whole gesture — the same
      // reasoning the class registry's reorder gives.
      if (!row) continue;
      row.sortOrder = entry.sortOrder;
      touched.push(row);
    }
    if (touched.length) await this.repo.save(touched);
    return this.list({ branchId: dto.branchId });
  }

  /**
   * Delete a station outright — a typo being undone, or a prep area that never
   * existed.
   *
   * Unlike a school class there is nothing to strand: a station holds no
   * records, and any category routed to it simply falls through to the
   * un-routed ticket, which still prints. A branch retiring a real station
   * wants INACTIVE, so a reprint of an order that went there can still name it.
   */
  async remove(id: number, branchId: number) {
    const row = await this.repo.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException('Station not found for this branch.');
    await this.repo.delete({ id: row.id });
    return { deleted: true, id: Number(row.id), code: row.code };
  }
}
