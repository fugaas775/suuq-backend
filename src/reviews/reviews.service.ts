import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
  ) {}

  async create(userId: number, productId: number, dto: CreateReviewDto) {
    // Prevent duplicate reviews by the same user for the same product
    const existing = await this.reviewRepository.findOne({
      where: { user: { id: userId }, product: { id: productId } },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this product.');
    }
    // For MVP, skip purchase check
    const review = this.reviewRepository.create({
      rating: dto.rating,
      comment: dto.comment,
      user: { id: userId } as any,
      product: { id: productId } as any,
    });
    return this.reviewRepository.save(review);
  }

  async findAllForProduct(productId: number) {
    return this.reviewRepository.find({
      where: { product: { id: productId } },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }
}
