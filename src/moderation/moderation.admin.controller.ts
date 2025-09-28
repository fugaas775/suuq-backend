import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRepository as InjectRepo } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { Query } from '@nestjs/common';
import { ProductImageModeration } from './entities/product-image-moderation.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { ModerationScannerService } from './scanner.service';
import { ProductImage } from '../products/entities/product-image.entity';

@Controller('admin/moderation')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminModerationController {
  constructor(
    @InjectRepository(ProductImageModeration)
    private pimRepo: Repository<ProductImageModeration>,
    @InjectRepository(ProductImage)
    private imgRepo: Repository<ProductImage>,
  @InjectRepo(Product)
  private productRepo: Repository<Product>,
    private readonly scanner: ModerationScannerService,
  ) {}

  @Get('queue')
  async queue(
    @Query('page') pageRaw?: string,
    @Query('per_page') perPageRaw?: string,
    @Query('sort') sortRaw?: string,
    @Query('status') statusRaw?: string,
  ) {
    const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(perPageRaw || '50', 10) || 50, 1), 200);
    const sort = (sortRaw || 'confidence_desc').toLowerCase();
    const status = (statusRaw || 'flagged').toLowerCase();
    const order: any = {};
    if (sort === 'confidence_desc') order.topConfidence = 'DESC';
    else if (sort === 'confidence_asc') order.topConfidence = 'ASC';
    else if (sort === 'created_asc') order.createdAt = 'ASC';
    else order.createdAt = 'DESC';

    const where: any = {};
    if (['flagged', 'pending', 'approved', 'rejected'].includes(status)) where.status = status;

    const [items, total] = await this.pimRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { items, total, page, perPage };
  }

  @Patch(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number) {
    await this.pimRepo.update(id, { status: 'approved', reviewedAt: new Date() });
    const rec = await this.pimRepo.findOne({ where: { id } });
    if (rec) {
      const remaining = await this.pimRepo.count({ where: { productId: rec.productId, status: 'flagged' } });
      if (!remaining) await this.productRepo.update(rec.productId, { isBlocked: false });
    }
    return { ok: true };
  }

  @Patch(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    await this.pimRepo.update(id, { status: 'rejected', reason: reason || null, reviewedAt: new Date() });
  const rec = await this.pimRepo.findOne({ where: { id } });
  if (rec) await this.productRepo.update(rec.productId, { isBlocked: true });
    return { ok: true };
  }

  @Get('stats')
  async stats() {
    const byStatus = await this.pimRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(1)', 'count')
      .groupBy('p.status')
      .getRawMany<{ status: string; count: string }>();
    const map: Record<string, number> = {};
    for (const r of byStatus) map[r.status] = Number(r.count || 0);
    // 24h counts
    const last24 = await this.pimRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(1)', 'count')
      .where('p."createdAt" > NOW() - INTERVAL \'24 hours\'')
      .groupBy('p.status')
      .getRawMany<{ status: string; count: string }>();
    const last24Map: Record<string, number> = {};
    for (const r of last24) last24Map[r.status] = Number(r.count || 0);
    return {
      totals: {
        pending: map['pending'] || 0,
        flagged: map['flagged'] || 0,
        approved: map['approved'] || 0,
        rejected: map['rejected'] || 0,
      },
      last24h: {
        pending: last24Map['pending'] || 0,
        flagged: last24Map['flagged'] || 0,
        approved: last24Map['approved'] || 0,
        rejected: last24Map['rejected'] || 0,
      },
    };
  }

  @Patch(':id/rescan')
  async rescan(@Param('id', ParseIntPipe) id: number) {
    const rec = await this.pimRepo.findOne({ where: { id } });
    if (!rec) return { ok: false };
    const img = await this.imgRepo.findOne({ where: { id: rec.productImageId }, relations: ['product'] });
    if (!img) return { ok: false };
    await this.scanner.processImage(img);
    return { ok: true };
  }
}
