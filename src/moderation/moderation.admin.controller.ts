import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
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
import { UserReport } from './entities/user-report.entity';

@Controller('moderation')
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
    @InjectRepository(UserReport)
    private reportRepo: Repository<UserReport>,
    private readonly scanner: ModerationScannerService,
  ) {}

  // --- User Reports Endpoints ---

  @Get('reports')
  async listReports(
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('status') status?: string,
  ) {
    const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(limitRaw || '20', 10) || 20, 1),
      100,
    );

    const where: any = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (status) where.status = status;

    const [items, total] = await this.reportRepo.findAndCount({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where,
      relations: ['reporter', 'product', 'product.vendor', 'product.images'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Manually serialize to plain objects to trigger getters (like thumbnail)

    const plainItems = instanceToPlain(items) as any[];

    // Remove images array to force frontend to use the thumbnail property
    // which is computed correctly by the backend now.
    plainItems.forEach((item) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (item.product && item.product.images) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        delete item.product.images;
      }
    });

    return { items: plainItems, total, page, limit };
  }

  @Patch('reports/:id')
  async updateReportStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'pending' | 'reviewed' | 'dismissed' },
  ) {
    await this.reportRepo.update(id, { status: body.status });
    return { success: true };
  }

  @Patch('reports/:id/block-product')
  async blockProductFromReport(
    @Param('id', ParseIntPipe) id: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body() _body: { reason?: string },
  ) {
    const report = await this.reportRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!report) throw new Error('Report not found');

    // Block the product
    await this.productRepo.update(report.product.id, { isBlocked: true });

    // Mark report as reviewed
    report.status = 'reviewed';
    await this.reportRepo.save(report);

    return { success: true, message: 'Product blocked and report resolved' };
  }

  @Patch(['reports/:id/restore-product', 'reports/:id/restore'])
  async restoreProductFromReport(
    @Param('id', ParseIntPipe) id: number,
  ) {
    const report = await this.reportRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!report) throw new Error('Report not found');

    if (!report.product) throw new Error('Product not associated with this report');

    // Unblock the product
    await this.productRepo.update(report.product.id, { isBlocked: false });

    // Optionally update report status if logic requires it, 
    // but usually 'reviewed' is fine as past tense.
    // If you want to indicate it's "re-reviewed" or similar, do it here.
    // For now, we assume restoring might be correcting a mistake or mercy.
    
    return { success: true, message: 'Product restored (unblocked)' };
  }

  // --- Existing Image Moderation Endpoints ---

  @Get('queue')
  async queue(
    @Query('page') pageRaw?: string,
    @Query('per_page') perPageRaw?: string,
    @Query('sort') sortRaw?: string,
    @Query('status') statusRaw?: string,
  ) {
    const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
    const perPage = Math.min(
      Math.max(parseInt(perPageRaw || '50', 10) || 50, 1),
      200,
    );
    const sort = (sortRaw || 'confidence_desc').toLowerCase();
    const status = (statusRaw || 'flagged').toLowerCase();

    const order: any = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (sort === 'confidence_desc') order.topConfidence = 'DESC';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    else if (sort === 'confidence_asc') order.topConfidence = 'ASC';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    else if (sort === 'created_asc') order.createdAt = 'ASC';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    else order.createdAt = 'DESC';

    const where: any = {};
    if (['flagged', 'pending', 'approved', 'rejected'].includes(status))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      where.status = status;

    const [items, total] = await this.pimRepo.findAndCount({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      order,
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { items, total, page, perPage };
  }

  @Patch(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number) {
    await this.pimRepo.update(id, {
      status: 'approved',
      reviewedAt: new Date(),
    });
    const rec = await this.pimRepo.findOne({ where: { id } });
    if (rec) {
      const remaining = await this.pimRepo.count({
        where: { productId: rec.productId, status: 'flagged' },
      });
      if (!remaining)
        await this.productRepo.update(rec.productId, { isBlocked: false });
    }
    return { ok: true };
  }

  @Patch(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    await this.pimRepo.update(id, {
      status: 'rejected',
      reason: reason || null,
      reviewedAt: new Date(),
    });
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
    const img = await this.imgRepo.findOne({
      where: { id: rec.productImageId },
      relations: ['product'],
    });
    if (!img) return { ok: false };
    await this.scanner.processImage(img);
    return { ok: true };
  }
}
