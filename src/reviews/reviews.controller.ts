import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // GET /api/reviews?productId=4
  @Get('reviews')
  getProductReviewsQuery(@Query('productId', ParseIntPipe) productId: number) {
    if (!productId) throw new BadRequestException('productId is required');
    return this.reviewsService.getProductReviews(productId);
  }

  // POST /api/reviews?productId=4
  @Post('reviews')
  @UseGuards(AuthGuard('jwt'))
  createReviewQuery(
    @Query('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateReviewDto,
    @Req() req: any,
  ) {
    if (!productId) throw new BadRequestException('productId is required');
    return this.reviewsService.createReview(productId, req.user.id, dto);
  }

  // GET /api/products/:productId/reviews
  @Get('products/:productId/reviews')
  getProductReviewsParam(@Param('productId', ParseIntPipe) productId: number) {
    if (!productId) throw new BadRequestException('productId is required');
    return this.reviewsService.getProductReviews(productId);
  }

  // POST /api/products/:productId/reviews
  @Post('products/:productId/reviews')
  @UseGuards(AuthGuard('jwt'))
  createReviewParam(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateReviewDto,
    @Req() req: any,
  ) {
    if (!productId) throw new BadRequestException('productId is required');
    return this.reviewsService.createReview(productId, req.user.id, dto);
  }
}