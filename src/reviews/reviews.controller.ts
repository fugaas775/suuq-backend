import { Controller, Post, Get, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './create-review.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Param('productId') productId: number,
    @Body() dto: CreateReviewDto,
    @Request() req: any
  ) {
    return this.reviewsService.create(req.user.id, productId, dto);
  }

  @Get()
  async findAll(@Param('productId') productId: number) {
    return this.reviewsService.findAllForProduct(productId);
  }
}
