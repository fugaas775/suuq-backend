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
    const amount = this.resolveReservationAmount(reservation);
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

  private resolveReservationAmount(reservation: HotelReservation): number {
    // Simple night-count × placeholder rate (real rate plan lookup can be
    // added when ratePlan is linked to a HotelRatePlan entity).
    const checkIn = new Date(reservation.checkInAt);
    const checkOut = new Date(reservation.checkOutAt);
    const nights = Math.max(
      1,
      Math.round(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    // Placeholder nightly rate of 1000 ETB — real implementation should
    // join ratePlanId → pos_hotel_rate_plans.weekdayRate
    return nights * 1000;
  }
}
