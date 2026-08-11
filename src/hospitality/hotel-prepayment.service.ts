import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  HotelReservation,
  HotelReservationStatus,
} from './entities/hotel-reservation.entity';
import { HotelRatePlan } from './entities/hotel-rate-plan.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { EbirrService } from '../ebirr/ebirr.service';
import { TelebirrService } from '../telebirr/telebirr.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { StarpayService } from '../starpay/starpay.service';
import {
  PayConsumerReservationDto,
  PrepaymentProvider,
} from './dto/consumer-hotel.dto';

/**
 * Handles consumer-facing payment for hotel reservations booked via the Suuq app.
 * Each provider is tried based on the `provider` field in the DTO.
 */
@Injectable()
export class HotelPrepaymentService {
  private readonly logger = new Logger(HotelPrepaymentService.name);

  constructor(
    @InjectRepository(HotelReservation)
    private readonly reservationRepo: Repository<HotelReservation>,
    @InjectRepository(HotelRatePlan)
    private readonly ratePlanRepo: Repository<HotelRatePlan>,
    @InjectRepository(VendorStore)
    private readonly vendorStoreRepo: Repository<VendorStore>,
    private readonly ebirrService: EbirrService,
    private readonly telebirrService: TelebirrService,
    private readonly mpesaService: MpesaService,
    private readonly starpayService: StarpayService,
  ) {}

  /**
   * Initiate consumer prepayment for a reservation.
   * Sets prepaymentStatus = 'PENDING' immediately, then kicks off the
   * provider-specific payment flow. The provider callback will later
   * update the status to 'PAID' or 'FAILED'.
   */
  async initiatePayment(
    reservationId: number,
    customerUserId: number,
    dto: PayConsumerReservationDto,
  ): Promise<{ paymentSessionId: string; instructions: string }> {
    const reservation = await this.reservationRepo.findOne({
      where: { id: reservationId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation #${reservationId} not found`);
    }
    if (reservation.customerUserId !== customerUserId) {
      throw new BadRequestException('Reservation does not belong to this user');
    }
    if (reservation.prepaymentStatus === 'PAID') {
      throw new BadRequestException('Reservation is already paid');
    }

    // Calculate amount — derive from ratePlan if available; fallback placeholder
    const amount = await this.resolveReservationAmount(reservation);
    const currency = dto.currency ?? 'ETB';
    const orderId = `RES-${reservation.id}-${Date.now()}`;

    let paymentSessionId: string;
    let instructions: string;

    switch (dto.provider) {
      case PrepaymentProvider.EBIRR: {
        const result = await this.ebirrService.initiatePayment({
          amount: String(amount),
          referenceId: orderId,
          invoiceId: orderId,
          phoneNumber: dto.phone,
          description: `Hotel reservation #${reservation.id}`,
        });
        paymentSessionId = result?.orderId ?? orderId;
        instructions = `Open your Ebirr app and approve the payment request sent to ${dto.phone}.`;
        break;
      }

      case PrepaymentProvider.TELEBIRR: {
        const result = await this.telebirrService.createOrder(
          String(amount),
          orderId,
        );
        paymentSessionId = result?.data?.toPayUrl || orderId;
        instructions = `Complete payment via the Telebirr link: ${paymentSessionId}`;
        break;
      }

      case PrepaymentProvider.MPESA: {
        const result = await this.mpesaService.initiateStkPush(
          amount,
          dto.phone,
          reservation.id,
        );
        paymentSessionId = result?.CheckoutRequestID ?? orderId;
        instructions = `Check your M-Pesa prompt on ${dto.phone} to approve the payment.`;
        break;
      }

      case PrepaymentProvider.STARPAY: {
        const result = await this.starpayService.initiateWalletPayment({
          amount,
          currency,
          referenceId: orderId,
          phone: dto.phone,
        } as any);
        paymentSessionId = String(
          (result?.data as Record<string, unknown>)?.['orderId'] ??
            (result?.data as Record<string, unknown>)?.['transactionId'] ??
            orderId,
        );
        instructions = `Approve the StarPay wallet payment on ${dto.phone}.`;
        break;
      }

      default:
        throw new BadRequestException(`Unsupported payment provider`);
    }

    // Persist pending state
    await this.reservationRepo.update(reservationId, {
      paymentSessionId,
      prepaymentStatus: 'PENDING',
    });

    return { paymentSessionId, instructions };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Compute the prepayment amount from the reservation's rate plan: sum of
   * per-night rates across the stay (weekend = Fri/Sat), mirroring the night-audit
   * billing so the consumer prepays what the folio will accrue. Resolves the plan
   * by explicit ratePlanId, else by room type, else the branch's default plan.
   * Falls back to a conservative 1000/night placeholder only when no rate plan is
   * configured, so the payment flow still works (reconciled at the desk).
   */
  private async resolveReservationAmount(
    reservation: HotelReservation,
  ): Promise<number> {
    let plan: HotelRatePlan | null = null;
    if (reservation.ratePlanId) {
      plan = await this.ratePlanRepo.findOne({
        where: { id: reservation.ratePlanId },
      });
    }
    if (!plan && reservation.roomType) {
      plan = await this.ratePlanRepo.findOne({
        where: {
          branchId: reservation.branchId,
          roomType: reservation.roomType.toUpperCase(),
          isActive: true,
        },
      });
    }
    if (!plan) {
      const plans = await this.ratePlanRepo.find({
        where: { branchId: reservation.branchId, isActive: true },
      });
      plan = plans.find((p) => !p.roomType) ?? plans[0] ?? null;
    }

    const weekdayRate = plan ? Number(plan.weekdayRate) : 0;
    const weekendRate =
      plan && plan.weekendRate != null ? Number(plan.weekendRate) : weekdayRate;

    // Walk each night [checkIn, checkOut) and apply the weekday/weekend rate.
    let total = 0;
    let nights = 0;
    if (reservation.checkInAt && reservation.checkOutAt) {
      let cur = new Date(`${reservation.checkInAt}T12:00:00Z`);
      const end = new Date(`${reservation.checkOutAt}T12:00:00Z`);
      while (cur < end) {
        const dow = cur.getUTCDay(); // 0 Sun … 6 Sat
        total += dow === 5 || dow === 6 ? weekendRate : weekdayRate;
        nights += 1;
        cur = new Date(cur.getTime() + 24 * 60 * 60_000);
      }
    }
    if (nights === 0) nights = 1;

    // No usable rate plan → conservative placeholder so payment still proceeds.
    if (!plan || weekdayRate <= 0) {
      return nights * 1000;
    }
    if (total <= 0) total = nights * weekdayRate;
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }
}
