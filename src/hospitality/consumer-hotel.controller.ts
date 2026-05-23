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
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
@Controller()
@UseGuards(JwtAuthGuard)
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
  async createReservation(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: CreateConsumerReservationDto,
    @Request() req: any,
  ) {
    const userId: number = req.user?.id ?? req.user?.userId;
    if (!userId) throw new BadRequestException('Authenticated user required');

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

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const guestName =
      user?.displayName?.trim() ||
      user?.email?.split('@')[0] ||
      `Guest #${userId}`;
    const guestPhone =
      dto.guestPhone ??
      (user?.phoneNumber
        ? `${user.phoneCountryCode ?? ''}${user.phoneNumber}`.trim()
        : null);

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
  async listMyReservations(@Request() req: any) {
    const userId: number = req.user?.id ?? req.user?.userId;
    const items = await this.reservationRepo.find({
      where: { customerUserId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { items: items.map((r) => this.toReservationDto(r)) };
  }

  // GET /api/v2/me/hotel/reservations/:id
  @Get('v2/me/hotel/reservations/:id')
  async getMyReservation(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    const userId: number = req.user?.id ?? req.user?.userId;
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
  async payReservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayConsumerReservationDto,
    @Request() req: any,
  ) {
    const userId: number = req.user?.id ?? req.user?.userId;
    return this.prepaymentService.initiatePayment(id, userId, dto);
  }

  // PATCH /api/v2/me/hotel/reservations/:id/cancel
  @Patch('v2/me/hotel/reservations/:id/cancel')
  async cancelReservation(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    const userId: number = req.user?.id ?? req.user?.userId;
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
