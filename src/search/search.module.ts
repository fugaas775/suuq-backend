import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { ImageSearchController } from './image-search.controller';
import { ImageSimilarityService } from './image-similarity.service';
import { ProductImage } from '../products/entities/product-image.entity';
import { SearchLog } from './entities/search-log.entity';
import { SearchLogController } from './search-log.controller';
import { SearchLogService } from './search-log.service';

@Module({
  imports: [
    forwardRef(() => ProductsModule),
    TypeOrmModule.forFeature([ProductImage, SearchLog]),
  ],
  controllers: [ImageSearchController, SearchLogController],
  providers: [ImageSimilarityService, SearchLogService],
})
export class SearchModule {}
