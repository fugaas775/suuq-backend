import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { ProductImageModeration } from './entities/product-image-moderation.entity';
import { ContentModerationService } from './content-moderation.service';
import axios from 'axios';

@Injectable()
export class ModerationScannerService {
  private readonly logger = new Logger(ModerationScannerService.name);

  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ProductImage) private productImageRepo: Repository<ProductImage>,
    @InjectRepository(ProductImageModeration)
    private pimRepo: Repository<ProductImageModeration>,
    private readonly moderation: ContentModerationService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scanRecent(): Promise<void> {
    // Scan latest images without a moderation record or still pending
    try {
      const recent = await this.productImageRepo
        .createQueryBuilder('img')
        .leftJoin('img.product', 'product')
        .where('img."createdAt" > NOW() - INTERVAL \'7 days\'')
        .orderBy('img."createdAt"', 'DESC')
        .limit(200)
        .getMany();

      for (const img of recent) {
        const exists = await this.pimRepo.findOne({ where: { productImageId: (img as any).id } });
        if (exists && exists.status !== 'pending') continue;
        await this.processImage(img).catch((e) => this.logger.warn(e?.message || e));
      }
    } catch (e) {
      this.logger.error('scanRecent failed', e as any);
    }
  }

  private async fetchBytes(url: string): Promise<Buffer> {
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
    return Buffer.from(res.data as any);
  }

  async processImage(img: ProductImage): Promise<void> {
    const url = img.thumbnailSrc || img.src;
    if (!url) return;
    const buf = await this.fetchBytes(url);
    const labels = await this.moderation.analyzeImage(buf);
    const decision = this.moderation.isExplicit(labels);
    const record = await this.pimRepo.findOne({ where: { productImageId: (img as any).id } });
    const entity = record || this.pimRepo.create({
      productId: (img as any).product?.id || (img as any).productId,
      productImageId: (img as any).id,
      imageUrl: url,
      status: 'pending',
    });
    entity.labels = labels;
    entity.matchedLabels = decision.matched;
    entity.topConfidence = Math.max(...(labels || []).map((l) => Number(l.Confidence || 0)), 0) || null;
    entity.status = decision.explicit ? 'flagged' : 'approved';
    await this.pimRepo.save(entity);

    const productId = entity.productId;
    if (entity.status === 'flagged') {
      // Immediately hide the product
      await this.productRepo.update(productId, { isBlocked: true });
    } else if (entity.status === 'approved') {
      // If no other pending/flagged records remain, unhide
      const remaining = await this.pimRepo.count({
        where: { productId, status: (['flagged', 'pending'] as any) },
      } as any);
      if (!remaining) {
        await this.productRepo.update(productId, { isBlocked: false });
      }
    }
  }
}
