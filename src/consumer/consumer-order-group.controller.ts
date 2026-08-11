import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ConsumerOrderGroupService } from './consumer-order-group.service';
import { PlaceConsumerOrderGroupDto } from './dto/place-consumer-order-group.dto';

/**
 * A checkout on suuq-s.com, and the page that follows it.
 *
 * One POST here can place several orders — one per shop in the basket — so the
 * throttle is per checkout rather than per order. The single-order endpoint's
 * 10/min would reject a legitimate three-shop basket outright; calling
 * `ConsumerOrderService` directly rather than over HTTP keeps that limit where it
 * belongs (on the endpoint the Flutter app and QR shop use) without it landing
 * on this one.
 *
 * Auth is optional throughout: a shopper with no account is the normal case.
 * When they do happen to be signed in, the guard hands us a user id worth
 * keeping — and it makes the throttler track them by identity instead of
 * penalising everyone behind one café's wifi.
 */
const CHECKOUT_THROTTLE = { default: { ttl: 60_000, limit: 6 } };
const TRACKING_THROTTLE = { default: { ttl: 60_000, limit: 60 } };

@Controller('consumer/v1/order-groups')
@UseGuards(OptionalJwtAuthGuard)
export class ConsumerOrderGroupController {
  constructor(private readonly groupService: ConsumerOrderGroupService) {}

  /** POST /consumer/v1/order-groups — check out a basket spanning 1..10 shops. */
  @Post()
  @Throttle(CHECKOUT_THROTTLE)
  placeGroup(@Body() dto: PlaceConsumerOrderGroupDto, @Req() req) {
    return this.groupService.placeGroup(dto, req.user?.id ?? null);
  }

  /**
   * GET /consumer/v1/order-groups/:publicRef — the tracking page's whole feed.
   *
   * The code is the credential. A wrong one is a 404, never a 403: telling
   * someone their guess addressed a real order is itself the leak.
   */
  @Get(':publicRef')
  @Throttle(TRACKING_THROTTLE)
  getGroup(@Param('publicRef') publicRef: string) {
    return this.groupService.getGroup(publicRef);
  }
}
