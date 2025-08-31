import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Tag } from '../tags/tag.entity';
import { ProductsService } from '../products/products.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/curation')
export class AdminCurationController {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Tag) private readonly tagRepo: Repository<Tag>,
    private readonly productsService: ProductsService,
  ) {}

  private async ensureTag(name: string): Promise<Tag> {
    let tag = await this.tagRepo.findOne({ where: { name } });
    if (!tag) {
      tag = this.tagRepo.create({ name });
      tag = await this.tagRepo.save(tag);
    }
    return tag;
  }

  // GET /api/admin/curation/home -> curated lists
  @Get('home')
  async getCuratedHome(@Query() q: any) {
    const per = Math.min(Number(q.limit || q.per_page) || 50, 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const v: 'grid' | 'full' = q.view === 'full' ? 'full' : 'grid';
    const search = q.q || q.search || undefined;
    const vendorId = q.vendorId ? Number(q.vendorId) : undefined;
    const categoryId = q.categoryId
      ? Number(q.categoryId)
      : q.category
        ? Number(q.category)
        : undefined;
    const categorySlug = q.categorySlug || q.category_slug || undefined;

    const curatedNewTags = 'home-new,home_new,new_arrival,curated-new';
    const curatedBestTags = 'home-best,home_best,best_seller,curated-best';

    const baseFilters: any = { perPage: per, page, view: v };
    if (search) baseFilters.search = String(search);
    if (vendorId && Number.isInteger(vendorId)) baseFilters.vendorId = vendorId;
    if (categorySlug) baseFilters.categorySlug = String(categorySlug);
    else if (categoryId && Number.isInteger(categoryId))
      baseFilters.categoryId = categoryId;

    const [curatedNew, curatedBest] = await Promise.all([
      this.productsService.findFiltered({
        ...baseFilters,
        tags: curatedNewTags,
        sort: 'created_desc',
      }),
      this.productsService.findFiltered({
        ...baseFilters,
        tags: curatedBestTags,
        sort: 'sales_desc',
      }),
    ]);

    return {
      curatedNew: curatedNew.items,
      curatedBest: curatedBest.items,
      curatedNewCount: curatedNew.total,
      curatedBestCount: curatedBest.total,
      curatedNewMeta: {
        page: curatedNew.currentPage,
        perPage: curatedNew.perPage,
        total: curatedNew.total,
        totalPages: curatedNew.totalPages,
      },
      curatedBestMeta: {
        page: curatedBest.currentPage,
        perPage: curatedBest.perPage,
        total: curatedBest.total,
        totalPages: curatedBest.totalPages,
      },
      // echo applied filters for UI/debug
      appliedFilters: {
        page,
        perPage: per,
        view: v,
        search: search || null,
        vendorId: vendorId || null,
        categoryId: categoryId || null,
        categorySlug: categorySlug || null,
      },
    };
  }

  // POST /api/admin/curation/home -> add tags to product IDs
  @Post('home')
  async addCurations(
    @Body() body: { addNewIds?: number[]; addBestIds?: number[] },
  ) {
    const addNewIds = Array.isArray(body?.addNewIds)
      ? body.addNewIds.filter((n) => Number.isInteger(n))
      : [];
    const addBestIds = Array.isArray(body?.addBestIds)
      ? body.addBestIds.filter((n) => Number.isInteger(n))
      : [];

    const [newTag, bestTag] = await Promise.all([
      this.ensureTag('home-new'),
      this.ensureTag('home-best'),
    ]);

    const summary: any = {
      requestedNew: addNewIds.length,
      requestedBest: addBestIds.length,
      addedNew: [],
      skippedNew: [],
      addedBest: [],
      skippedBest: [],
      notFoundNewIds: [],
      notFoundBestIds: [],
      errors: [] as Array<{
        id: number;
        reason: string;
        bucket: 'new' | 'best';
      }>,
    };

    if (addNewIds.length) {
      const products = await this.productRepo.find({
        where: { id: In(addNewIds) },
        relations: ['tags'],
      });
      const foundIds = new Set(products.map((p) => p.id));
      const notFound = addNewIds.filter((id) => !foundIds.has(id));
      if (notFound.length) {
        summary.notFoundNewIds = notFound;
        for (const id of notFound)
          summary.errors.push({ id, reason: 'NOT_FOUND', bucket: 'new' });
      }
      for (const p of products) {
        const names = new Set((p.tags || []).map((t) => t.name));
        if (!names.has(newTag.name)) {
          p.tags = [...(p.tags || []), newTag];
          await this.productRepo.save(p);
          summary.addedNew.push(p.id);
        } else {
          summary.skippedNew.push(p.id);
          summary.errors.push({
            id: p.id,
            reason: 'ALREADY_TAGGED',
            bucket: 'new',
          });
        }
      }
    }

    if (addBestIds.length) {
      const products = await this.productRepo.find({
        where: { id: In(addBestIds) },
        relations: ['tags'],
      });
      const foundIds = new Set(products.map((p) => p.id));
      const notFound = addBestIds.filter((id) => !foundIds.has(id));
      if (notFound.length) {
        summary.notFoundBestIds = notFound;
        for (const id of notFound)
          summary.errors.push({ id, reason: 'NOT_FOUND', bucket: 'best' });
      }
      for (const p of products) {
        const names = new Set((p.tags || []).map((t) => t.name));
        if (!names.has(bestTag.name)) {
          p.tags = [...(p.tags || []), bestTag];
          await this.productRepo.save(p);
          summary.addedBest.push(p.id);
        } else {
          summary.skippedBest.push(p.id);
          summary.errors.push({
            id: p.id,
            reason: 'ALREADY_TAGGED',
            bucket: 'best',
          });
        }
      }
    }

    // Counts after update
    const [newCount, bestCount] = await Promise.all([
      this.productsService
        .findFiltered({
          perPage: 1,
          tags: 'home-new,home_new,new_arrival,curated-new',
          sort: 'created_desc',
          view: 'grid',
        } as any)
        .then((r) => r.total),
      this.productsService
        .findFiltered({
          perPage: 1,
          tags: 'home-best,home_best,best_seller,curated-best',
          sort: 'sales_desc',
          view: 'grid',
        } as any)
        .then((r) => r.total),
    ]);
    return {
      ...summary,
      curatedNewCount: newCount,
      curatedBestCount: bestCount,
    };
  }

  // DELETE /api/admin/curation/home -> remove tags from product IDs
  @Delete('home')
  @HttpCode(HttpStatus.OK)
  async removeCurations(
    @Body() body: { removeNewIds?: number[]; removeBestIds?: number[] },
  ) {
    return this._removeCurationsInternal(body);
  }

  // POST /api/admin/curation/home/remove -> alternative for clients that avoid DELETE bodies
  @Post('home/remove')
  async removeCurationsPost(
    @Body() body: { removeNewIds?: number[]; removeBestIds?: number[] },
  ) {
    return this._removeCurationsInternal(body);
  }

  private async _removeCurationsInternal(body: {
    removeNewIds?: number[];
    removeBestIds?: number[];
  }) {
    const removeNewIds = Array.isArray(body?.removeNewIds)
      ? body.removeNewIds.filter((n) => Number.isInteger(n))
      : [];
    const removeBestIds = Array.isArray(body?.removeBestIds)
      ? body.removeBestIds.filter((n) => Number.isInteger(n))
      : [];

    const summary: any = {
      requestedNew: removeNewIds.length,
      requestedBest: removeBestIds.length,
      removedNew: [],
      skippedNew: [],
      removedBest: [],
      skippedBest: [],
      notFoundNewIds: [],
      notFoundBestIds: [],
      errors: [] as Array<{
        id: number;
        reason: string;
        bucket: 'new' | 'best';
      }>,
    };

    if (removeNewIds.length) {
      const products = await this.productRepo.find({
        where: { id: In(removeNewIds) },
        relations: ['tags'],
      });
      const foundIds = new Set(products.map((p) => p.id));
      const notFound = removeNewIds.filter((id) => !foundIds.has(id));
      if (notFound.length) {
        summary.notFoundNewIds = notFound;
        for (const id of notFound)
          summary.errors.push({ id, reason: 'NOT_FOUND', bucket: 'new' });
      }
      for (const p of products) {
        const before = p.tags?.length || 0;
        p.tags = (p.tags || []).filter(
          (t) =>
            t.name !== 'home-new' &&
            t.name !== 'home_new' &&
            t.name !== 'new_arrival' &&
            t.name !== 'curated-new',
        );
        if ((p.tags?.length || 0) !== before) {
          await this.productRepo.save(p);
          summary.removedNew.push(p.id);
        } else {
          summary.skippedNew.push(p.id);
          summary.errors.push({
            id: p.id,
            reason: 'NOT_TAGGED',
            bucket: 'new',
          });
        }
      }
    }

    if (removeBestIds.length) {
      const products = await this.productRepo.find({
        where: { id: In(removeBestIds) },
        relations: ['tags'],
      });
      const foundIds = new Set(products.map((p) => p.id));
      const notFound = removeBestIds.filter((id) => !foundIds.has(id));
      if (notFound.length) {
        summary.notFoundBestIds = notFound;
        for (const id of notFound)
          summary.errors.push({ id, reason: 'NOT_FOUND', bucket: 'best' });
      }
      for (const p of products) {
        const before = p.tags?.length || 0;
        p.tags = (p.tags || []).filter(
          (t) =>
            t.name !== 'home-best' &&
            t.name !== 'home_best' &&
            t.name !== 'best_seller' &&
            t.name !== 'curated-best',
        );
        if ((p.tags?.length || 0) !== before) {
          await this.productRepo.save(p);
          summary.removedBest.push(p.id);
        } else {
          summary.skippedBest.push(p.id);
          summary.errors.push({
            id: p.id,
            reason: 'NOT_TAGGED',
            bucket: 'best',
          });
        }
      }
    }

    const [newCount, bestCount] = await Promise.all([
      this.productsService
        .findFiltered({
          perPage: 1,
          tags: 'home-new,home_new,new_arrival,curated-new',
          sort: 'created_desc',
          view: 'grid',
        } as any)
        .then((r) => r.total),
      this.productsService
        .findFiltered({
          perPage: 1,
          tags: 'home-best,home_best,best_seller,curated-best',
          sort: 'sales_desc',
          view: 'grid',
        } as any)
        .then((r) => r.total),
    ]);
    return {
      ...summary,
      curatedNewCount: newCount,
      curatedBestCount: bestCount,
    };
  }

  // PATCH /api/admin/curation/products/:id/tags -> add/remove curated tags on a single product
  @Patch('products/:id/tags')
  async patchProductTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { add?: string[]; remove?: string[] },
  ) {
    const allowed = new Set(['home-new', 'home-best']);
    const add = (Array.isArray(body?.add) ? body.add : []).filter((t) =>
      allowed.has(t),
    );
    const remove = (Array.isArray(body?.remove) ? body.remove : []).filter(
      (t) => allowed.has(t),
    );

    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!product) {
      throw new (require('@nestjs/common').NotFoundException)(
        'Product not found',
      );
    }

    let tags = product.tags || [];

    const added: string[] = [];
    const removed: string[] = [];
    const skippedAdd: string[] = [];
    const skippedRemove: string[] = [];

    // Add tags
    if (add.length) {
      const ensure = await Promise.all(add.map((n) => this.ensureTag(n)));
      const existingNames = new Set(tags.map((t) => t.name));
      for (const t of ensure) {
        if (!existingNames.has(t.name)) {
          tags.push(t);
          added.push(t.name);
        } else {
          skippedAdd.push(t.name);
        }
      }
    }

    // Remove tags
    if (remove.length) {
      const removeSet = new Set(remove);
      const before = new Set(tags.map((t) => t.name));
      tags = tags.filter((t) => {
        const willRemove = removeSet.has(t.name);
        if (willRemove) removed.push(t.name);
        return !willRemove;
      });
      for (const name of remove)
        if (!before.has(name)) skippedRemove.push(name);
    }

    product.tags = tags;
    await this.productRepo.save(product);
    const [newCount, bestCount] = await Promise.all([
      this.productsService
        .findFiltered({
          perPage: 1,
          tags: 'home-new,home_new,new_arrival,curated-new',
          sort: 'created_desc',
          view: 'grid',
        } as any)
        .then((r) => r.total),
      this.productsService
        .findFiltered({
          perPage: 1,
          tags: 'home-best,home_best,best_seller,curated-best',
          sort: 'sales_desc',
          view: 'grid',
        } as any)
        .then((r) => r.total),
    ]);
    return {
      id: product.id,
      tags: product.tags.map((t) => t.name),
      added,
      removed,
      skippedAdd,
      skippedRemove,
      curatedNewCount: newCount,
      curatedBestCount: bestCount,
    };
  }
}
