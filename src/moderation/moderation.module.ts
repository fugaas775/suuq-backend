import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductsModule } from '../products/products.module';
import { MediaModule } from '../media/media.module';
import { ContentModerationService } from './content-moderation.service';
import { ProductImageModeration } from './entities/product-image-moderation.entity';
import { ModerationScannerService } from './scanner.service';
import { AdminModerationController } from './moderation.admin.controller';
import { ModerationAdminStatsController } from './moderation.admin-stats.controller';
import { VendorAppealsController } from './moderation.vendor.controller';
import { UsersModule } from '../users/users.module';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { UserReport } from './entities/user-report.entity';
import { ModerationController } from './moderation.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      ProductImageModeration,
      Product,
      ProductImage,
      UserReport,
    ]),
    ProductsModule,
    MediaModule,
    UsersModule,
  ],
  providers: [ContentModerationService, ModerationScannerService],
  controllers: [
    AdminModerationController,
    ModerationAdminStatsController,
    VendorAppealsController,
    ModerationController,
  ],
  exports: [TypeOrmModule],
})
export class ModerationModule {}
