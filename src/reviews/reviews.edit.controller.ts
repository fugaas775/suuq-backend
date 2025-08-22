import { Controller, Put, Param, Body, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './create-review.dto';

@Controller('reviews')
export class ReviewsEditController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: CreateReviewDto
  ) {
    return this.reviewsService.update(id, req.user.id, dto);
  }
}
