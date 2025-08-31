import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  Res,
  Put,
  HttpStatus,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './create-review.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';

@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Param('productId') productId: number,
    @Body() dto: CreateReviewDto,
    @Request() req: any,
  ) {
    const result = await this.reviewsService.create(
      req.user.id,
      Number(productId),
      dto,
    );
    // If updated existing, return 200; if created new, return 201
    return {
      statusCode: result.updated ? HttpStatus.OK : HttpStatus.CREATED,
      review: result.review,
      updated: result.updated,
    };
  }

  @Get()
  async findAll(@Param('productId') productId: number) {
    return this.reviewsService.findAllForProduct(productId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findMine(
    @Param('productId', ParseIntPipe) productId: number,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const review = await this.reviewsService.findMine(req.user.id, productId);
    if (!review) {
      res.status(204);
      return;
    }
    return review;
  }
}
