import {
  BadRequestException,
  Injectable,
  PreconditionFailedException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Favorite } from './entities/favorite.entity';
import { PatchFavoritesDto } from './dto/patch-favorites.dto';
import { PutFavoritesDto } from './dto/put-favorites.dto';
import { Product } from '../products/entities/product.entity';
import { createHash } from 'crypto';
import { instanceToPlain } from 'class-transformer';

export type FavoritesResponse = {
  userId: 'me';
  ids: number[];
  count: number;
  updatedAt: string;
  version: number;
  etag: string;
  products?: Product[];
};

const MAX_ITEMS = 2000;

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite) private readonly favRepo: Repository<Favorite>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  private readonly logger = new Logger('FavoritesService');

  async ensureRow(userId: number): Promise<Favorite> {
    let row = await this.favRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.favRepo.create({ userId, ids: [], version: 0 });
      await this.favRepo.save(row);
    }
    return row;
  }

  makeEtag(version: number, ids: number[]): string {
    const hash = createHash('sha1')
      .update(`${version}:${ids.join(',')}`)
      .digest('hex');
    return `W/"fav-${version}-${hash}"`;
  }

  private toResponse(row: Favorite, products?: Product[]): FavoritesResponse {
    // Force plain objects to avoid serialization issues with entity instances
    const plainProducts = products
      ? (instanceToPlain(products) as Product[])
      : undefined;
    return {
      userId: 'me',
      ids: row.ids,
      count: row.ids.length,
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
      etag: this.makeEtag(row.version, row.ids),
      ...(plainProducts ? { products: plainProducts } : {}),
    };
  }

  async get(
    userId: number,
    includeProducts: boolean,
  ): Promise<FavoritesResponse> {
    const row = await this.ensureRow(userId);
    let products: Product[] | undefined;
    if (includeProducts && row.ids.length) {
      const list = await this.productRepo.find({ where: { id: In(row.ids) } });
      // preserve order
      const order = new Map(row.ids.map((id, idx) => [id, idx]));
      products = list.sort((a, b) => order.get(a.id) - order.get(b.id));
    }
    return this.toResponse(row, products);
  }

  private async validateIds(
    ids: number[],
    partial = false,
  ): Promise<{ valid: number[]; invalid: number[] } | number[]> {
    if (!ids?.length) return partial ? { valid: [], invalid: [] } : [];
    const rows = await this.productRepo.find({
      select: ['id'],
      where: { id: In(ids) },
    });
    const validSet = new Set(rows.map((r) => r.id));
    const valid = ids.filter((id) => validSet.has(id));
    if (partial) {
      const invalid = ids.filter((id) => !validSet.has(id));
      return { valid, invalid };
    }
    if (valid.length !== ids.length) {
      const missing = ids.filter((id) => !validSet.has(id));
      throw new BadRequestException({
        message: 'Invalid product IDs',
        invalid: missing,
      });
    }
    return valid;
  }

  private applyLimitOrThrow(ids: number[]): void {
    if (ids.length > MAX_ITEMS) {
      throw new HttpException(
        { message: `Favorites limit ${MAX_ITEMS} exceeded`, count: ids.length },
        422,
      );
    }
  }

  private checkIfMatchOrThrow(ifMatch: string | undefined, row: Favorite) {
    if (!ifMatch) return;
    const current = this.makeEtag(row.version, row.ids);
    if (ifMatch !== current) {
      const err: any = new PreconditionFailedException('ETag mismatch');
      err.response = {
        statusCode: 412,
        message: 'ETag mismatch',
        etag: current,
        version: row.version,
      };
      throw err;
    }
  }

  async patch(
    userId: number,
    dto: PatchFavoritesDto,
    ifMatch?: string,
    merge: 'union' | 'server' | 'client' = 'union',
  ) {
    const row = await this.ensureRow(userId);
    this.checkIfMatchOrThrow(ifMatch, row);

    const append = dto.append !== false;
    const partial = dto.partial === true;
    const addIdsRaw = dto.add ?? [];
    const removeIdsRaw = dto.remove ?? [];

    // Validate
    const addRes = await this.validateIds(addIdsRaw, partial);
    const addIds = Array.isArray(addRes) ? addRes : addRes.valid;
    const invalid = Array.isArray(addRes) ? [] : addRes.invalid;
    const removeRes = (await this.validateIds(removeIdsRaw, true)) as {
      valid: number[];
    };
    const removeIds = removeRes.valid;

    let current = row.ids.slice();
    // Merge strategies
    if (merge === 'server') {
      // Keep server state; ignore adds
    } else if (merge === 'client') {
      // Prefer client-provided adds (remove then add into empty set)
      current = [];
    }

    // Merge strategy applied only when both sides provide sets (login union etc.). For PATCH, we treat as union by default.
    // Remove first
    if (removeIds.length) {
      const removeSet = new Set(removeIds);
      current = current.filter((id) => !removeSet.has(id));
    }
    // Add
    if (addIds.length) {
      const seen = new Set(current);
      const toAdd = addIds.filter((id) => !seen.has(id));
      if (append) {
        current = current.concat(toAdd);
      } else {
        // prepend in order
        current = toAdd.concat(current);
      }
    }

    this.applyLimitOrThrow(current);

    // Only bump if changed
    if (row.ids.join(',') !== current.join(',')) {
      row.ids = current;
      row.version += 1;
      await this.favRepo.save(row);
      this.logger.log(
        `user=${userId} patch changed version=${row.version} count=${row.ids.length} add=${addIds.length} remove=${removeIds.length}`,
      );
    }

    const resp = this.toResponse(row);
    if (invalid.length && partial) {
      (resp as any).invalid = invalid;
    }
    return resp;
  }

  async put(userId: number, dto: PutFavoritesDto, ifMatch?: string) {
    const row = await this.ensureRow(userId);
    this.checkIfMatchOrThrow(ifMatch, row);
    const partial = dto.partial === true;
    const res = await this.validateIds(dto.ids, partial);
    const ids = Array.isArray(res) ? res : res.valid;
    const invalid = Array.isArray(res) ? [] : res.invalid;

    // Enforce uniqueness and order as provided
    const seen = new Set<number>();
    const deduped: number[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(id);
      }
    }

    this.applyLimitOrThrow(deduped);

    if (row.ids.join(',') !== deduped.join(',')) {
      row.ids = deduped;
      row.version += 1;
      await this.favRepo.save(row);
      this.logger.log(
        `user=${userId} put changed version=${row.version} count=${row.ids.length}`,
      );
    }
    const resp = this.toResponse(row);
    if (invalid.length && partial) {
      (resp as any).invalid = invalid;
    }
    return resp;
  }

  async clear(userId: number) {
    const row = await this.ensureRow(userId);
    if (row.ids.length > 0) {
      row.ids = [];
      row.version += 1;
      await this.favRepo.save(row);
      this.logger.log(`user=${userId} clear version=${row.version}`);
    }
  }

  async contains(
    userId: number,
    ids: number[],
  ): Promise<Record<string, boolean>> {
    const row = await this.ensureRow(userId);
    const set = new Set(row.ids);
    const result: Record<string, boolean> = {};
    for (const id of ids) result[id.toString()] = set.has(id);
    return result;
  }

  /**
   * Return how many users have favorited the given product.
   * Uses a database-side array operator to avoid scanning all rows in memory.
   */
  async countLikes(productId: number): Promise<number> {
    // SELECT COUNT(*) FROM favorites WHERE ids @> ARRAY[productId]
    // TypeORM query builder with Postgres array contains operator
    const qb = this.favRepo
      .createQueryBuilder('f')
      .where(':pid = ANY(f.ids)', { pid: productId })
      .select('COUNT(*)', 'cnt');
    const raw = await qb.getRawOne<{ cnt: string }>();
    const n = raw?.cnt ? parseInt(raw.cnt, 10) : 0;
    return Number.isNaN(n) ? 0 : n;
  }

  /**
   * Bulk likes count for multiple product IDs.
   * Uses Postgres UNNEST to expand favorites.ids array and group by element.
   */
  async countLikesBulk(ids: number[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const list = Array.from(
      new Set((ids || []).filter((n) => Number.isFinite(n))),
    );
    if (!list.length) return out;
    const sql = `
      SELECT u.pid AS product_id, COUNT(*)::bigint AS cnt
      FROM unnest($1::int[]) AS u(pid)
      JOIN favorites f ON u.pid = ANY(f.ids)
      GROUP BY u.pid
    `;
    try {
      const rows: Array<{ product_id: number; cnt: string }> =
        await this.favRepo.query(sql, [list]);
      for (const r of rows) {
        const pid = Number(r.product_id);
        const c = parseInt(r.cnt, 10) || 0;
        if (Number.isFinite(pid)) out[String(pid)] = c;
      }
    } catch (e) {
      // Fallback: loop sequentially to avoid total failure
      for (const id of list) {
        try {
          out[String(id)] = await this.countLikes(id);
        } catch {
          out[String(id)] = 0;
        }
      }
    }
    return out;
  }

  /** Remove a product ID from all users' favorites and bump version for changed rows. Returns affected row count. */
  async removeProductEverywhere(productId: number): Promise<number> {
    try {
      const res: { rowCount?: number } = await this.favRepo.query(
        `UPDATE favorites SET ids = array_remove(ids, $1), version = CASE WHEN $1 = ANY(ids) THEN version + 1 ELSE version END WHERE $1 = ANY(ids)`,
        [productId],
      );
      // Some drivers don't populate rowCount; compute as best-effort
      return typeof res?.rowCount === 'number' ? res.rowCount : 0;
    } catch (e) {
      this.logger.warn(
        `removeProductEverywhere failed for id=${productId}: ${(e as Error).message}`,
      );
      return 0;
    }
  }
}
