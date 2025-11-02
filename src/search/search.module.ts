import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { ImageSearchController } from './image-search.controller';
import { ImageSimilarityService } from './image-similarity.service';
import { ProductImage } from '../products/entities/product-image.entity';

@Module({
  imports: [forwardRef(() => ProductsModule), TypeOrmModule.forFeature([ProductImage])],
  controllers: [ImageSearchController],
  providers: [ImageSimilarityService],
})
export class SearchModule {}
