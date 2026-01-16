/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProductRequestsService } from './product-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateProductRequestDto } from './dto/create-product-request.dto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ListProductRequestQueryDto } from './dto/list-product-request-query.dto';
import { UpdateProductRequestStatusDto } from './dto/update-product-request-status.dto';
import { ListProductRequestFeedDto } from './dto/list-product-request-feed.dto';
import { CreateProductRequestOfferDto } from './dto/create-product-request-offer.dto';
import { RespondOfferDto } from './dto/respond-offer.dto';

@Controller([
  'product-requests',
  'v2/product-requests',
  'vendor/product-requests',
  'v2/vendor/product-requests',
])
export class ProductRequestsController {
  constructor(private readonly productRequests: ProductRequestsService) {}

  // Allow guests to submit requests; no auth required
  @Post('guest')
  createAsGuest(@Body() dto: CreateProductRequestDto) {
    return this.productRequests.createGuestRequest(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(
    @Body() dto: CreateProductRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.createRequest(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('mine')
  listMine(
    @Query() query: ListProductRequestQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.listBuyerRequests(user.id, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('mine/:id')
  getMine(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.findRequestForBuyer(user.id, id, {
      includeOffers: true,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('mine/:id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductRequestStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.updateStatusAsBuyer(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('mine/:id/offers')
  listOffersForBuyer(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.listOffersForBuyer(user.id, id);
  }

  // Lightweight analytics endpoints to satisfy mobile/Admin callers; currently no-op but keep for compatibility.
  @Post('search/log')
  searchLog(@Body() _body: any, @Req() _req: AuthenticatedRequest) {
    // Future: persist search logs for analytics; for now acknowledge receipt to avoid 404s.
    return { ok: true };
  }

  @Post('analytics/zero-results')
  analyticsZeroResults(@Body() _body: any, @Req() _req: AuthenticatedRequest) {
    // Future: store zero-result analytics; for now acknowledge receipt to avoid 404s.
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('feed')
  sellerFeed(
    @Query() query: ListProductRequestFeedDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.listSellerFeed(user.id, user.roles, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('forwarded')
  forwardedFeed(
    @Query() query: ListProductRequestFeedDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.listForwardedToSeller(
      user.id,
      user.roles,
      query,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/offers')
  createOffer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductRequestOfferDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.createOffer(user.id, user.roles, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/offers/my')
  listSellerOffers(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.listSellerOffersForRequest(user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('mine/:id/offers/:offerId/accept')
  acceptOffer(
    @Param('id', ParseIntPipe) id: number,
    @Param('offerId', ParseIntPipe) offerId: number,
    @Body() body: RespondOfferDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.acceptOffer(user.id, id, offerId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('mine/:id/offers/:offerId/reject')
  rejectOffer(
    @Param('id', ParseIntPipe) id: number,
    @Param('offerId', ParseIntPipe) offerId: number,
    @Body() body: RespondOfferDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user;
    return this.productRequests.rejectOffer(user.id, id, offerId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const request = await this.productRequests.findOne(id);
    const user = req.user;

    let adminNote: string | null = null;
    let forwardDetails: any = null;

    // If vendor, attach forwarding details (note from admin, etc)
    if (user.roles?.includes('VENDOR')) {
      const forward = await this.productRequests.getForwardDetails(id, user.id);
      if (forward) {
        adminNote = forward.note || null;
        forwardDetails = forward;
      }
    }

    // Flatten guest contact info for convenience if present
    const metadata: any = request.metadata || {};
    const guestContact = metadata.guestContact || {};

    return {
      ...request,
      adminNote, // Injected for vendors
      forwardedAt: forwardDetails?.forwardedAt || null,
      guestName: guestContact.name || null,
      guestEmail: guestContact.email || null,
      guestPhone: guestContact.phone || null,
    };
  }

  // --- Analytics/search logging compatibility endpoints (v1/v2, alt paths) ---
  @Post([
    'search/log',
    'searches/log',
    'zero-search',
    'analytics/zero-results',
    'analytics/zero-searches',
    'analytics/searches/zero',
    'analytics/searches/zero-results',
  ])
  legacyAnalytics(@Body() _body: any) {
    return { ok: true };
  }

  @Post([
    'v2/search/log',
    'v2/searches/log',
    'v2/zero-search',
    'v2/analytics/zero-results',
    'v2/analytics/zero-searches',
    'v2/analytics/searches/zero',
    'v2/analytics/searches/zero-results',
  ])
  legacyAnalyticsV2(@Body() _body: any) {
    return { ok: true };
  }
}
