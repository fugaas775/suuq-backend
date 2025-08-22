import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsEditController } from './reviews.edit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Product])],
  providers: [ReviewsService],
  controllers: [ReviewsController, ReviewsEditController],
  exports: [ReviewsService],
})
export class ReviewsModule {}
