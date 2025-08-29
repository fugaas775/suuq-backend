import { BadRequestException, Injectable, PreconditionFailedException, HttpException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Favorite } from './entities/favorite.entity';
import { PatchFavoritesDto } from './dto/patch-favorites.dto';
import { PutFavoritesDto } from './dto/put-favorites.dto';
import { Product } from '../products/entities/product.entity';
import { createHash } from 'crypto';

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
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
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
    const hash = createHash('sha1').update(`${version}:${ids.join(',')}`).digest('hex');
    return `W/"fav-${version}-${hash}"`;
  }

  private toResponse(row: Favorite, products?: Product[]): FavoritesResponse {
    return {
      userId: 'me',
      ids: row.ids,
      count: row.ids.length,
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
      etag: this.makeEtag(row.version, row.ids),
      ...(products ? { products } : {}),
    };
  }

  async get(userId: number, includeProducts: boolean): Promise<FavoritesResponse> {
    const row = await this.ensureRow(userId);
    let products: Product[] | undefined;
    if (includeProducts && row.ids.length) {
      const list = await this.productRepo.find({ where: { id: In(row.ids) } });
      // preserve order
      const order = new Map(row.ids.map((id, idx) => [id, idx]));
      products = list.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
    }
    return this.toResponse(row, products);
  }

  private async validateIds(ids: number[], partial = false): Promise<{ valid: number[]; invalid: number[] } | number[]> {
    if (!ids?.length) return partial ? { valid: [], invalid: [] } : [];
    const rows = await this.productRepo.find({ select: ['id'], where: { id: In(ids) } });
    const validSet = new Set(rows.map((r) => r.id));
    const valid = ids.filter((id) => validSet.has(id));
    if (partial) {
      const invalid = ids.filter((id) => !validSet.has(id));
      return { valid, invalid };
    }
    if (valid.length !== ids.length) {
      const missing = ids.filter((id) => !validSet.has(id));
      throw new BadRequestException({ message: 'Invalid product IDs', invalid: missing });
    }
    return valid;
  }

  private applyLimitOrThrow(ids: number[]): void {
    if (ids.length > MAX_ITEMS) {
  throw new HttpException({ message: `Favorites limit ${MAX_ITEMS} exceeded`, count: ids.length }, 422);
    }
  }

  private checkIfMatchOrThrow(ifMatch: string | undefined, row: Favorite) {
    if (!ifMatch) return;
    const current = this.makeEtag(row.version, row.ids);
    if (ifMatch !== current) {
      const err: any = new PreconditionFailedException('ETag mismatch');
      err.response = { statusCode: 412, message: 'ETag mismatch', etag: current, version: row.version };
      throw err;
    }
  }

  async patch(userId: number, dto: PatchFavoritesDto, ifMatch?: string, merge: 'union' | 'server' | 'client' = 'union') {
    let row = await this.ensureRow(userId);
    this.checkIfMatchOrThrow(ifMatch, row);

    const append = dto.append !== false;
    const partial = dto.partial === true;
    const addIdsRaw = dto.add ?? [];
    const removeIdsRaw = dto.remove ?? [];

    // Validate
    const addRes = await this.validateIds(addIdsRaw, partial);
    const addIds = Array.isArray(addRes) ? addRes : addRes.valid;
    const invalid = Array.isArray(addRes) ? [] : addRes.invalid;
    const removeRes = await this.validateIds(removeIdsRaw, true) as { valid: number[] };
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
  this.logger.log(`user=${userId} patch changed version=${row.version} count=${row.ids.length} add=${addIds.length} remove=${removeIds.length}`);
    }

    const resp = this.toResponse(row);
    if (invalid.length && partial) {
      (resp as any).invalid = invalid;
    }
    return resp;
  }

  async put(userId: number, dto: PutFavoritesDto, ifMatch?: string) {
    let row = await this.ensureRow(userId);
    this.checkIfMatchOrThrow(ifMatch, row);
    const partial = dto.partial === true;
    const res = await this.validateIds(dto.ids, partial);
    const ids = Array.isArray(res) ? res : res.valid;
    const invalid = Array.isArray(res) ? [] : res.invalid;

    // Enforce uniqueness and order as provided
    const seen = new Set<number>();
    const deduped: number[] = [];
    for (const id of ids) { if (!seen.has(id)) { seen.add(id); deduped.push(id); } }

    this.applyLimitOrThrow(deduped);

    if (row.ids.join(',') !== deduped.join(',')) {
      row.ids = deduped;
      row.version += 1;
      await this.favRepo.save(row);
  this.logger.log(`user=${userId} put changed version=${row.version} count=${row.ids.length}`);
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

  async contains(userId: number, ids: number[]): Promise<Record<string, boolean>> {
    const row = await this.ensureRow(userId);
    const set = new Set(row.ids);
    const result: Record<string, boolean> = {};
    for (const id of ids) result[id.toString()] = set.has(id);
    return result;
  }
}
