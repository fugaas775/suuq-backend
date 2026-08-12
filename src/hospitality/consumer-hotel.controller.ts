import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import {
  HotelReservation,
  HotelReservationStatus,
} from './entities/hotel-reservation.entity';
import { HotelRatePlan } from './entities/hotel-rate-plan.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { User } from '../users/entities/user.entity';
import { HotelPrepaymentService } from './hotel-prepayment.service';
import {
  CreateConsumerReservationDto,
  PayConsumerReservationDto,
} from './dto/consumer-hotel.dto';

/**
 * Consumer-facing hotel reservation endpoints.
 * All routes require JWT auth.
 */
/**
 * GUARDS ARE PER METHOD HERE, DELIBERATELY.
 *
 * This used to carry `@UseGuards(JwtAuthGuard)` on the class, and booking a
 * room was the only consumer path in the product that demanded an account —
 * a guest could order food from a café by scanning a card, but not ask a hotel
 * for a room. Opening the POST means the class guard has to go, because Nest
 * ADDS method guards to class guards rather than replacing them.
 *
 * That makes every `/me/` route below load-bearing. Each reads its user from
 * the token and queries `where: { customerUserId: userId }` — and TypeORM DROPS
 * an undefined condition, so an unguarded one would hand an anonymous caller
 * the fifty most recent reservations across every hotel on the platform, names
 * and phone numbers included. There is no global guard in this application
 * (`@Public()` is inert documentation), so a missing decorator is an open
 * route. Hence both the per-method guard AND the explicit userId check inside.
 */
@Controller()
export class ConsumerHotelController {
  constructor(
    @InjectRepository(HotelReservation)
    private readonly reservationRepo: Repository<HotelReservation>,
    @InjectRepository(HotelRatePlan)
    private readonly ratePlanRepo: Repository<HotelRatePlan>,
    @InjectRepository(VendorStore)
    private readonly vendorStoreRepo: Repository<VendorStore>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly prepaymentService: HotelPrepaymentService,
  ) {}

  // POST /api/v2/stores/:storeId/hotel/reservations
  @Post('v2/stores/:storeId/hotel/reservations')
  @UseGuards(OptionalJwtAuthGuard)
  async createReservation(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: CreateConsumerReservationDto,
    @Request() req: any,
  ) {
    // No account needed. A guest scanning the hotel's printed card is the same
    // person who can order a coffee by scanning a café's — requiring a login
    // here was the one place in the product that disagreed.
    const userId: number | null = req.user?.id ?? req.user?.userId ?? null;

    const store = await this.vendorStoreRepo.findOne({
      where: { id: storeId, isConsumerVisible: true },
    });
    if (!store || !store.branchId) {
      throw new NotFoundException(`Store #${storeId} not found`);
    }
    if (store.serviceFormat !== 'HOTEL') {
      throw new BadRequestException(`Store #${storeId} is not a HOTEL store`);
    }

    if (dto.checkInAt >= dto.checkOutAt) {
      throw new BadRequestException('checkInAt must be before checkOutAt');
    }

    const user = userId
      ? await this.userRepo.findOne({ where: { id: userId } })
      : null;
    const guestName =
      dto.guestName?.trim() ||
      user?.displayName?.trim() ||
      user?.email?.split('@')[0] ||
      (userId ? `Guest #${userId}` : '');
    const guestPhone =
      dto.guestPhone?.trim() ||
      (user?.phoneNumber
        ? `${user.phoneCountryCode ?? ''}${user.phoneNumber}`.trim()
        : null);

    // With no account behind it, the name and number ARE the booking: a room
    // held for nobody the desk can call is a room lost for the night.
    if (!userId && (!guestName || !guestPhone)) {
      throw new BadRequestException(
        'Tell the hotel your name and a phone number so they can hold the room.',
      );
    }

    const reservation = this.reservationRepo.create({
      branchId: store.branchId,
      status: HotelReservationStatus.HOLD,
      checkInAt: dto.checkInAt,
      checkOutAt: dto.checkOutAt,
      roomType: dto.roomType ?? null,
      ratePlanId: dto.ratePlanId ?? null,
      numberOfGuests: dto.numberOfGuests ?? 1,
      notes: dto.notes ?? null,
      guestName,
      guestPhone,
      guestEmail: user?.email ?? null,
      source: 'CONSUMER_APP',
      customerUserId: userId,
      createdByUserId: userId,
      prepaymentStatus: 'PENDING',
    });

    const saved = await this.reservationRepo.save(reservation);
    return this.toReservationDto(saved);
  }

  // GET /api/v2/me/hotel/reservations
  @Get('v2/me/hotel/reservations')
  @UseGuards(JwtAuthGuard)
  async listMyReservations(@Request() req: any) {
    const userId: number = req.user?.id ?? req.user?.userId;
    // Belt and braces behind the guard: an undefined id would make TypeORM drop
    // the condition and return every hotel's guests.
    if (!userId) throw new UnauthorizedException();
    const items = await this.reservationRepo.find({
      where: { customerUserId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { items: items.map((r) => this.toReservationDto(r)) };
  }

  // GET /api/v2/me/hotel/reservations/:id
  @Get('v2/me/hotel/reservations/:id')
  @UseGuards(JwtAuthGuard)
  async getMyReservation(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    const userId: number = req.user?.id ?? req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    const reservation = await this.reservationRepo.findOne({
      where: { id, customerUserId: userId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation #${id} not found`);
    }
    return this.toReservationDto(reservation);
  }

  // POST /api/v2/me/hotel/reservations/:id/pay
  @Post('v2/me/hotel/reservations/:id/pay')
  @UseGuards(JwtAuthGuard)
  async payReservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayConsumerReservationDto,
    @Request() req: any,
  ) {
    const userId: number = req.user?.id ?? req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    return this.prepaymentService.initiatePayment(id, userId, dto);
  }

  // PATCH /api/v2/me/hotel/reservations/:id/cancel
  @Patch('v2/me/hotel/reservations/:id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelReservation(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    const userId: number = req.user?.id ?? req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    const reservation = await this.reservationRepo.findOne({
      where: { id, customerUserId: userId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation #${id} not found`);
    }
    if (
      [
        HotelReservationStatus.CHECKED_IN,
        HotelReservationStatus.CHECKED_OUT,
      ].includes(reservation.status)
    ) {
      throw new BadRequestException(
        'Cannot cancel a reservation that is already checked in or out',
      );
    }
    await this.reservationRepo.update(id, {
      status: HotelReservationStatus.CANCELLED,
    });
    return { success: true, reservationId: id };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private toReservationDto(r: HotelReservation) {
    return {
      id: r.id,
      branchId: r.branchId,
      status: r.status,
      roomType: r.roomType,
      roomNumber: r.roomNumber,
      guestName: r.guestName,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      ratePlanId: r.ratePlanId,
      numberOfGuests: r.numberOfGuests,
      notes: r.notes,
      source: r.source,
      prepaymentStatus: r.prepaymentStatus,
      paymentSessionId: r.paymentSessionId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
