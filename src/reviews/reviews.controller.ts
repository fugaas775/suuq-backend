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
  HttpStatus,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './create-review.dto';
import {
  Query,
  Controller as RootController,
  Get as RootGet,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UseInterceptors } from '@nestjs/common';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';

// Lightweight in-memory cache for hot reviews endpoint (per-process, TTL-based)
// Keyed by productId; stores serialized payload and lastModified for headers.
const REVIEWS_CACHE = new Map<
  string,
  { data: unknown; lastModified?: string; expiresAt: number }
>();
const REVIEWS_TTL_MS = 60_000; // 60 seconds TTL

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
  @SkipThrottle()
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 20,
      burst: 30,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
  )
  async findAll(
    @Param('productId') productId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pid = String(productId);
    const now = Date.now();
    const cached = REVIEWS_CACHE.get(pid);
    if (cached && cached.expiresAt > now) {
      if (cached.lastModified) {
        res.setHeader('Last-Modified', cached.lastModified);
      }
      // Public cache for short period to allow client/proxy reuse
      res.setHeader(
        'Cache-Control',
        'public, max-age=60, stale-while-revalidate=30',
      );
      return cached.data;
    }

    const list = await this.reviewsService.findAllForProduct(productId);
    // Compute Last-Modified from newest review (if any)
    const lastModifiedDate = list?.length
      ? new Date(
          Math.max(...list.map((r: any) => new Date(r.createdAt).getTime())),
        )
      : undefined;
    const lastModified = lastModifiedDate?.toUTCString();

    if (lastModified) res.setHeader('Last-Modified', lastModified);
    res.setHeader(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=30',
    );

    // Cache the serialized data for a short period
    REVIEWS_CACHE.set(pid, {
      data: list,
      lastModified,
      expiresAt: now + REVIEWS_TTL_MS,
    });

    return list;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findMine(
    @Param('productId', ParseIntPipe) productId: number,
    @Request() req: { user?: { id?: number } },
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

@RootController('reviews')
export class ReviewsSummaryController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @RootGet('summary')
  @SkipThrottle()
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 30,
      burst: 60,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
  )
  async summary(
    @Query('ids') ids: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const list = String(ids || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (!list.length) return {};
    const data = await this.reviewsService.summaryBulk(list);
    // Allow brief caching of summaries as they change relatively infrequently
    res.setHeader(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=30',
    );
    return data;
  }
}
