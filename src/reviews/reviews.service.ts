import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async createReview(productId: number, userId: number, dto: CreateReviewDto): Promise<ReviewResponseDto> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Optional: Only one review per user per product
    const existing = await this.reviewRepo.findOne({ where: { product: { id: productId }, user: { id: userId } } });
    if (existing) throw new ForbiddenException('You already reviewed this product');

    const review = this.reviewRepo.create({
      ...dto,
      product,
      user,
    });
    await this.reviewRepo.save(review);

    return this.mapToResponseDto(review, user);
  }

  async getProductReviews(productId: number, page = 1, limit = 10): Promise<ReviewResponseDto[]> {
  const [reviews] = await this.reviewRepo.findAndCount({
    where: { product: { id: productId } },
    relations: ['user'],
    order: { createdAt: 'DESC' },
    skip: (page - 1) * limit,
    take: limit,
  });
  return reviews.map(r => this.mapToResponseDto(r, r.user));
}

  private mapToResponseDto(review: Review, user?: User): ReviewResponseDto {
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      user: user
        ? {
            id: user.id,
            displayName: user.displayName ?? user.email ?? '',
            avatarUrl: user.avatarUrl,
          }
        : undefined,
    };
  }
}