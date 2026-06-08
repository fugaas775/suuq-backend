import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PropertyBookingPaymentRecord,
  PropertyRentalBillingCycle,
  PropertyRentalBooking,
  PropertyRentalBookingStatus,
  PropertyTenantType,
} from './entities/property-rental-booking.entity';
import { PropertyRentalBookingCharge } from './entities/property-rental-booking-charge.entity';
import {
  ListPropertyBookingsQueryDto,
  OpenPropertyBookingDto,
  PostPropertyChargeDto,
  RecordPropertyPaymentDto,
  SettlePropertyBookingDto,
  TransferPropertyUnitDto,
  VoidPropertyBookingDto,
} from './dto/property-rental-booking.dto';
import {
  BillingUnit,
  computeBillingPeriods,
} from './property-rental-period.util';

type ActorSummary = { id?: number | null; email?: string | null };

function normalizeBillingCycle(
  value?: string | null,
): PropertyRentalBillingCycle {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized === 'WEEK'
    ? PropertyRentalBillingCycle.WEEK
    : PropertyRentalBillingCycle.MONTH;
}

function normalizeTenantType(value?: string | null): PropertyTenantType {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized === 'BUSINESS'
    ? PropertyTenantType.BUSINESS
    : PropertyTenantType.INDIVIDUAL;
}

@Injectable()
export class PropertyRentalBookingService {
  constructor(
    @InjectRepository(PropertyRentalBooking)
    private readonly bookingRepo: Repository<PropertyRentalBooking>,
    @InjectRepository(PropertyRentalBookingCharge)
    private readonly chargeRepo: Repository<PropertyRentalBookingCharge>,
  ) {}

  private toBookingResponse(
    booking: PropertyRentalBooking,
    charges: PropertyRentalBookingCharge[] = [],
  ) {
    return {
      id: booking.id,
      branchId: booking.branchId,
      localRef: booking.localRef,
      status: booking.status,
      propertyCode: booking.propertyCode,
      propertyId: booking.propertyId ?? null,
      renterName: booking.renterName,
      renterPhone: booking.renterPhone ?? null,
      renterEmail: booking.renterEmail ?? null,
      tenantType: booking.tenantType,
      renterNationality: booking.renterNationality ?? null,
      idType: booking.idType ?? null,
      idNumber: booking.idNumber ?? null,
      areaSqm: booking.areaSqm !== null ? Number(booking.areaSqm) : null,
      ratePlanId: booking.ratePlanId ?? null,
      reservationId: booking.reservationId ?? null,
      leaseStartAt: booking.leaseStartAt,
      leaseEndAt: booking.leaseEndAt,
      billingCycle: booking.billingCycle,
      periodsBilled: Number(booking.periodsBilled) || 0,
      currency: booking.currency,
      depositAmount: Number(booking.depositAmount) || 0,
      depositRefund:
        booking.depositRefund !== null ? Number(booking.depositRefund) : null,
      chargesTotal: Number(booking.chargesTotal) || 0,
      settledCheckoutId: booking.settledCheckoutId,
      paidAmount:
        booking.paidAmount !== null ? Number(booking.paidAmount) : null,
      // Running instalment ledger + remaining balance for partial payments.
      payments: Array.isArray(booking.payments) ? booking.payments : [],
      outstanding: Math.max(
        0,
        (Number(booking.chargesTotal) || 0) - (Number(booking.paidAmount) || 0),
      ),
      voidReason: booking.voidReason,
      transferredToProperty: booking.transferredToProperty,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      settledAt: booking.settledAt?.toISOString() ?? null,
      voidedAt: booking.voidedAt?.toISOString() ?? null,
      charges: charges.map((c) => ({
        id: c.id,
        chargeGroupCode: c.chargeGroupCode,
        chargeName: c.chargeName,
        amount: Number(c.amount),
        currency: c.currency,
        quantity: Number(c.quantity) || 1,
        recurring: c.recurring === true,
        notes: c.notes ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async listBookings(query: ListPropertyBookingsQueryDto) {
    const where: Partial<PropertyRentalBooking> = { branchId: query.branchId };

    if (query.status) {
      const normalized = String(query.status).trim().toUpperCase();
      if (
        Object.values(PropertyRentalBookingStatus).includes(
          normalized as PropertyRentalBookingStatus,
        )
      ) {
        where.status = normalized as PropertyRentalBookingStatus;
      }
    }

    const bookings = await this.bookingRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return {
      items: bookings.map((b) => this.toBookingResponse(b)),
    };
  }

  async getBooking(bookingId: number) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Property booking ${bookingId} not found.`);
    }
    const charges = await this.chargeRepo.find({
      where: { bookingId },
      order: { createdAt: 'ASC' },
    });
    return this.toBookingResponse(booking, charges);
  }

  async openBooking(dto: OpenPropertyBookingDto, actor?: ActorSummary) {
    const idempotencyKey = String(dto.idempotencyKey || '').trim();

    if (idempotencyKey) {
      const existing = await this.bookingRepo.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        return this.toBookingResponse(existing);
      }
    }

    const key = idempotencyKey || `property-open-${dto.branchId}-${Date.now()}`;
    const billingCycle = normalizeBillingCycle(dto.billingCycle);
    const leaseStartAt = dto.leaseStartAt ?? null;
    const leaseEndAt = dto.leaseEndAt ?? null;
    const periodsBilled = computeBillingPeriods(
      leaseStartAt,
      leaseEndAt,
      billingCycle,
    );

    const booking = this.bookingRepo.create({
      branchId: dto.branchId,
      localRef: dto.localRef ?? null,
      status: PropertyRentalBookingStatus.OPEN,
      propertyCode: String(dto.propertyCode || '').trim(),
      propertyId: dto.propertyId ?? null,
      renterName: dto.renterName ? String(dto.renterName).trim() : null,
      renterPhone: dto.renterPhone ? String(dto.renterPhone).trim() : null,
      renterEmail: dto.renterEmail ? String(dto.renterEmail).trim() : null,
      tenantType: normalizeTenantType(dto.tenantType),
      renterNationality: dto.renterNationality
        ? String(dto.renterNationality).trim()
        : null,
      idType: dto.idType ? String(dto.idType).trim() : null,
      idNumber: dto.idNumber ? String(dto.idNumber).trim() : null,
      areaSqm:
        dto.areaSqm !== undefined && dto.areaSqm !== null
          ? Number(dto.areaSqm)
          : null,
      ratePlanId: dto.ratePlanId ?? null,
      reservationId: dto.reservationId ?? null,
      leaseStartAt,
      leaseEndAt,
      billingCycle,
      periodsBilled,
      currency: dto.currency
        ? String(dto.currency).trim().toUpperCase()
        : 'ETB',
      depositAmount:
        dto.depositAmount !== undefined && dto.depositAmount !== null
          ? Number(dto.depositAmount)
          : 0,
      chargesTotal: 0,
      idempotencyKey: key,
      openedByUserId: actor?.id ?? null,
    });

    const saved = await this.bookingRepo.save(booking);
    return this.toBookingResponse(saved);
  }

  async postCharge(bookingId: number, dto: PostPropertyChargeDto) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Property booking ${bookingId} not found.`);
    }

    if (booking.status !== PropertyRentalBookingStatus.OPEN) {
      throw new BadRequestException(
        `Booking ${bookingId} is not open — cannot post charges.`,
      );
    }

    const idempotencyKey = String(dto.idempotencyKey || '').trim() || null;

    if (idempotencyKey) {
      const existing = await this.chargeRepo.findOne({
        where: { bookingId, idempotencyKey },
      });
      if (existing) {
        return {
          id: existing.id,
          bookingId,
          chargeGroupCode: existing.chargeGroupCode,
          chargeName: existing.chargeName,
          amount: Number(existing.amount),
          currency: existing.currency,
          quantity: Number(existing.quantity) || 1,
          recurring: existing.recurring === true,
          notes: existing.notes ?? null,
          createdAt: existing.createdAt.toISOString(),
        };
      }
    }

    const amount =
      Math.round((Number(dto.amount || 0) + Number.EPSILON) * 100) / 100;
    const quantity = Math.max(1, Math.round(Number(dto.quantity || 1)));

    const charge = this.chargeRepo.create({
      bookingId,
      branchId: booking.branchId,
      chargeGroupCode: dto.chargeGroupCode
        ? String(dto.chargeGroupCode).trim().toUpperCase()
        : null,
      chargeName: String(dto.chargeName).trim(),
      amount,
      currency: dto.currency
        ? String(dto.currency).trim().toUpperCase()
        : booking.currency,
      quantity,
      recurring: dto.recurring === true,
      notes: dto.notes ? String(dto.notes).trim() : null,
      idempotencyKey,
    });

    const saved = await this.chargeRepo.save(charge);

    // Update running total on the booking
    await this.bookingRepo.increment(
      { id: bookingId },
      'chargesTotal',
      amount * quantity,
    );

    return {
      id: saved.id,
      bookingId,
      chargeGroupCode: saved.chargeGroupCode,
      chargeName: saved.chargeName,
      amount: Number(saved.amount),
      currency: saved.currency,
      quantity: Number(saved.quantity) || 1,
      recurring: saved.recurring === true,
      notes: saved.notes ?? null,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  private normalizePaymentRows(
    rows: {
      method?: string;
      amount?: number;
      currency?: string;
      reference?: string;
    }[],
    fallbackCurrency: string,
    meta: {
      checkoutId?: string | null;
      idempotencyKey?: string | null;
      paidAt: string;
    },
  ): { records: PropertyBookingPaymentRecord[]; total: number } {
    const records: PropertyBookingPaymentRecord[] = (rows || [])
      .filter((p) => Number(p.amount || 0) > 0)
      .map((p) => ({
        amount:
          Math.round((Number(p.amount || 0) + Number.EPSILON) * 100) / 100,
        method: String(p.method || 'CASH')
          .trim()
          .toUpperCase(),
        currency: p.currency
          ? String(p.currency).trim().toUpperCase()
          : fallbackCurrency,
        reference: p.reference ? String(p.reference).trim() : null,
        checkoutId: meta.checkoutId ?? null,
        idempotencyKey: meta.idempotencyKey ?? null,
        paidAt: meta.paidAt,
      }));
    const total =
      Math.round(
        (records.reduce((s, p) => s + p.amount, 0) + Number.EPSILON) * 100,
      ) / 100;
    return { records, total };
  }

  /**
   * Records a single partial (instalment) payment against an OPEN booking.
   * Appends to the `payments` ledger and accrues `paidAmount`; the booking
   * stays OPEN until the final move-out settlement.
   */
  async recordPayment(bookingId: number, dto: RecordPropertyPaymentDto) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Property booking ${bookingId} not found.`);
    }
    if (booking.status !== PropertyRentalBookingStatus.OPEN) {
      throw new BadRequestException(
        `Booking ${bookingId} cannot take a payment from status ${booking.status}.`,
      );
    }

    const idempotencyKey = String(dto.idempotencyKey || '').trim() || null;
    const ledger: PropertyBookingPaymentRecord[] = Array.isArray(
      booking.payments,
    )
      ? booking.payments
      : [];
    if (
      idempotencyKey &&
      ledger.some((p) => p.idempotencyKey === idempotencyKey)
    ) {
      // Idempotent retry — payment already recorded.
      return this.toBookingResponse(booking);
    }

    const rows =
      dto.payments && dto.payments.length > 0
        ? dto.payments
        : dto.amount !== undefined
          ? [
              {
                method: dto.paymentMethod,
                amount: dto.amount,
                currency: dto.currency,
              },
            ]
          : [];
    const paidAt = dto.paidAt
      ? new Date(dto.paidAt).toISOString()
      : new Date().toISOString();
    const { records, total } = this.normalizePaymentRows(
      rows,
      booking.currency,
      { checkoutId: dto.checkoutId ?? null, idempotencyKey, paidAt },
    );
    if (total <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero.',
      );
    }

    booking.payments = [...ledger, ...records];
    booking.paidAmount =
      Math.round(
        ((Number(booking.paidAmount) || 0) + total + Number.EPSILON) * 100,
      ) / 100;
    const saved = await this.bookingRepo.save(booking);
    return this.toBookingResponse(saved);
  }

  async settleBooking(bookingId: number, dto: SettlePropertyBookingDto) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Property booking ${bookingId} not found.`);
    }

    if (booking.status === PropertyRentalBookingStatus.SETTLED) {
      // Idempotent — return current state
      return this.toBookingResponse(booking);
    }

    if (booking.status !== PropertyRentalBookingStatus.OPEN) {
      throw new BadRequestException(
        `Booking ${bookingId} cannot be settled from status ${booking.status}.`,
      );
    }

    booking.status = PropertyRentalBookingStatus.SETTLED;
    booking.settledCheckoutId = dto.checkoutId ?? null;
    const settledAt = dto.settledAt ? new Date(dto.settledAt) : new Date();
    // Final settlement payment(s) — the remaining balance for this transaction.
    const finalRows =
      dto.payments && dto.payments.length > 0
        ? dto.payments
        : dto.paidAmount !== undefined
          ? [
              {
                method: dto.paymentMethod,
                amount: dto.paidAmount,
                currency: dto.currency,
              },
            ]
          : [];
    const ledger: PropertyBookingPaymentRecord[] = Array.isArray(
      booking.payments,
    )
      ? booking.payments
      : [];
    const { records, total: finalPaid } = this.normalizePaymentRows(
      finalRows,
      booking.currency,
      {
        checkoutId: dto.checkoutId ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
        paidAt: settledAt.toISOString(),
      },
    );
    // Accumulate onto any prior partial instalments so the total reconciles.
    if (records.length > 0) {
      booking.payments = [...ledger, ...records];
      booking.paidAmount =
        Math.round(
          ((Number(booking.paidAmount) || 0) + finalPaid + Number.EPSILON) *
            100,
        ) / 100;
    } else if (booking.paidAmount === null && dto.paidAmount !== undefined) {
      booking.paidAmount = dto.paidAmount;
    }
    if (dto.depositRefund !== undefined && dto.depositRefund !== null) {
      booking.depositRefund = Number(dto.depositRefund);
    }
    booking.settledAt = settledAt;

    const saved = await this.bookingRepo.save(booking);
    return this.toBookingResponse(saved);
  }

  async voidBooking(bookingId: number, dto: VoidPropertyBookingDto) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Property booking ${bookingId} not found.`);
    }

    if (booking.status === PropertyRentalBookingStatus.VOIDED) {
      return this.toBookingResponse(booking);
    }

    if (booking.status === PropertyRentalBookingStatus.SETTLED) {
      throw new ConflictException(
        `Booking ${bookingId} is already settled and cannot be voided.`,
      );
    }

    booking.status = PropertyRentalBookingStatus.VOIDED;
    booking.voidReason = dto.reason ? String(dto.reason).trim() : null;
    booking.voidedAt = new Date();

    const saved = await this.bookingRepo.save(booking);
    return this.toBookingResponse(saved);
  }

  async transferUnit(bookingId: number, dto: TransferPropertyUnitDto) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Property booking ${bookingId} not found.`);
    }

    if (booking.status !== PropertyRentalBookingStatus.OPEN) {
      throw new BadRequestException(
        `Booking ${bookingId} is not open — cannot transfer unit.`,
      );
    }

    booking.transferredToProperty = booking.propertyCode;
    booking.propertyCode = String(dto.newPropertyCode).trim();

    if (dto.newRenterName) {
      booking.renterName = String(dto.newRenterName).trim();
    }

    const saved = await this.bookingRepo.save(booking);
    return this.toBookingResponse(saved);
  }
}
