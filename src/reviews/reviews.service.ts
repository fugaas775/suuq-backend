import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './create-review.dto';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(
    userId: number,
    productId: number,
    dto: CreateReviewDto,
  ): Promise<{ review: Review; updated: boolean }> {
    // Upsert behavior: if a review exists for (user, product), update it; otherwise create new
    const existing = await this.reviewRepository.findOne({
      where: { user: { id: userId }, product: { id: productId } },
      relations: ['user', 'product'],
    });
    if (existing) {
      const updated = await this.update(existing.id, userId, dto);
      return { review: updated, updated: true };
    }
    // For MVP, skip purchase check
    const review = this.reviewRepository.create({
      rating: dto.rating,
      comment: dto.comment,
      user: { id: userId } as any,
      product: { id: productId } as any,
    });
    const saved = await this.reviewRepository.save(review);
    await this.recomputeProductRating(productId);
    return { review: saved, updated: false };
  }

  async findAllForProduct(productId: number) {
    return this.reviewRepository.find({
      where: { product: { id: productId } },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  async findMine(userId: number, productId: number) {
    return this.reviewRepository.findOne({
      where: { user: { id: userId }, product: { id: productId } },
    });
  }

  async update(reviewId: number, userId: number, dto: CreateReviewDto) {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['user'],
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.user?.id !== userId) {
      throw new ForbiddenException('You can only edit your own review');
    }
    review.rating = dto.rating;
    review.comment = dto.comment;
    const saved = await this.reviewRepository.save(review);
    await this.recomputeProductRating(review.product.id);
    return saved;
  }

  private async recomputeProductRating(productId: number) {
    const { avg, count } = await this.reviewRepository
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.productId = :productId', { productId })
      .getRawOne<{ avg: string | null; count: string }>();

    const average = avg ? Math.round(parseFloat(avg) * 100) / 100 : null;
    const ratingCount = Number(count) || 0;
    await this.productRepository.update(productId, {
      average_rating: average as any,
      rating_count: ratingCount,
    });
  }
}
