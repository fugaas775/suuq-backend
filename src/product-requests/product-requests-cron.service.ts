import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, IsNull, Not } from 'typeorm';
import {
  ProductRequest,
  ProductRequestStatus,
} from './entities/product-request.entity';

@Injectable()
export class ProductRequestsCronService {
  private readonly logger = new Logger(ProductRequestsCronService.name);

  constructor(
    @InjectRepository(ProductRequest)
    private readonly productRequestRepo: Repository<ProductRequest>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupDeletedRequests() {
    this.logger.log('Starting cleanup of soft-deleted product requests...');
    try {
      // Hard delete queries bypass the automatic "deletedAt IS NULL" check
      // when using specific delete methods or raw queries, but here we can find
      // them specifically using withDeleted: true
      const softDeleted = await this.productRequestRepo.find({
        withDeleted: true,
        where: {
          deletedAt: Not(IsNull()),
        },
        select: ['id'],
      });

      if (softDeleted.length > 0) {
        const ids = softDeleted.map((r) => r.id);
        // Using delete() here performs the HARD delete from DB
        const result = await this.productRequestRepo.delete(ids);
        this.logger.log(
          `Permanently removed ${result.affected} soft-deleted product requests.`,
        );
      } else {
        this.logger.log('No soft-deleted requests found to cleanup.');
      }
    } catch (error) {
      this.logger.error('Error cleaning up deleted requests', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredRequests() {
    this.logger.log('Checking for expired product requests...');

    try {
      const now = new Date();

      // Find requests that are OPEN or IN_PROGRESS and have passed their expiry date
      const expiredRequests = await this.productRequestRepo.find({
        where: {
          status: In([
            ProductRequestStatus.OPEN,
            ProductRequestStatus.IN_PROGRESS,
          ]),
          expiresAt: LessThan(now),
        },
        select: ['id'], // Select only ID for performance
        take: 1000, // Process in batches if necessary, though direct update is better for bulk
      });

      if (expiredRequests.length === 0) {
        return;
      }

      const expiredIds = expiredRequests.map((req) => req.id);

      this.logger.log(
        `Found ${expiredIds.length} expired requests. Offloading (marking as EXPIRED)...`,
      );

      // Bulk update status to EXPIRED
      await this.productRequestRepo.update(
        { id: In(expiredIds) },
        {
          status: ProductRequestStatus.EXPIRED,
          closedAt: now,
        },
      );

      this.logger.log(
        `Successfully expired ${expiredIds.length} product requests.`,
      );
    } catch (error) {
      this.logger.error('Error handling expired product requests', error);
    }
  }
}
