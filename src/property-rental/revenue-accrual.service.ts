import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeneralLedgerService } from '../accounting/general-ledger.service';
import { GlAccountCode } from '../accounting/gl-accounts.constant';
import { GlJournalSourceType } from '../accounting/entities/gl-journal-entry.entity';
import {
  PropertyRentalBooking,
  PropertyRentalBookingStatus,
} from './entities/property-rental-booking.entity';
import { computeBillingPeriods } from './property-rental-period.util';

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export interface AccrualRecognition {
  /** Rent earned by elapsed time, capped at the total rent. */
  earnedToDate: number;
  /** Earned AND collected — the amount eligible to move out of deferred. */
  recognizable: number;
  /** New revenue to recognize on this run (recognizable − already recognized). */
  recognizeNow: number;
}

/**
 * Pure recognition math for one booking as of a date. Recognizes rent that is
 * both *earned* (by elapsed billing periods) and *collected* (deferred), never
 * more than already recognized. No DB/GL access so it can be unit-tested.
 */
export function computeAccrualRecognition(
  booking: Pick<
    PropertyRentalBooking,
    | 'leaseStartAt'
    | 'billingCycle'
    | 'periodsBilled'
    | 'chargesTotal'
    | 'paidAmount'
    | 'recognizedAmount'
  >,
  asOf: Date,
): AccrualRecognition {
  const periodsBilled = Number(booking.periodsBilled) || 0;
  const chargesTotal = Number(booking.chargesTotal) || 0;
  const paid = Number(booking.paidAmount) || 0;
  const recognized = Number(booking.recognizedAmount) || 0;

  if (!booking.leaseStartAt || periodsBilled <= 0 || chargesTotal <= 0) {
    return { earnedToDate: 0, recognizable: recognized, recognizeNow: 0 };
  }

  const unit = booking.billingCycle === 'WEEK' ? 'WEEK' : 'MONTH';
  const asOfDate = asOf.toISOString().slice(0, 10);
  const elapsed = Math.min(
    computeBillingPeriods(booking.leaseStartAt, asOfDate, unit),
    periodsBilled,
  );
  const perPeriod = chargesTotal / periodsBilled;
  const earnedToDate = round2(Math.min(perPeriod * elapsed, chargesTotal));
  const recognizable = round2(Math.min(earnedToDate, paid));
  // recognizeNow only ever increases recognized-to-date. `paidAmount` is
  // monotonic today (no refund path reduces it); if a partial-refund flow is
  // added that lowers paidAmount, this must also post a reversal to walk
  // recognizedAmount back down.
  const recognizeNow = round2(Math.max(0, recognizable - recognized));
  return { earnedToDate, recognizable, recognizeNow };
}

/**
 * Daily revenue-recognition job for accrual-basis property bookings. Moves the
 * earned-and-collected portion of deferred rent into rental revenue as time
 * elapses, so the P&L reflects rent month-by-month rather than all at move-out.
 * Idempotent: keyed by the cumulative recognizable amount, and guarded by the
 * booking's recognizedAmount.
 */
@Injectable()
export class RevenueAccrualService {
  private readonly logger = new Logger(RevenueAccrualService.name);

  constructor(
    @InjectRepository(PropertyRentalBooking)
    private readonly bookingRepo: Repository<PropertyRentalBooking>,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailyAccrual(
    asOf: Date = new Date(),
  ): Promise<{ recognized: number }> {
    const BATCH = 200;
    let recognizedTotal = 0;
    // Page through OPEN bookings so the job's memory is bounded regardless of
    // portfolio size. recognizeBooking leaves status OPEN, so a stable id-ordered
    // skip cursor never misses or repeats a booking.
    for (let skip = 0; ; skip += BATCH) {
      const bookings = await this.bookingRepo.find({
        where: { status: PropertyRentalBookingStatus.OPEN },
        order: { id: 'ASC' },
        take: BATCH,
        skip,
      });
      if (!bookings.length) break;
      for (const booking of bookings) {
        try {
          recognizedTotal += await this.recognizeBooking(booking, asOf);
        } catch (error) {
          this.logger.warn(
            `Accrual recognition failed for booking ${booking.id}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
      if (bookings.length < BATCH) break;
    }
    return { recognized: round2(recognizedTotal) };
  }

  /**
   * Recognize the newly-earned rent for a single booking and bump its
   * recognized-to-date. Returns the amount recognized on this call (0 if none).
   */
  async recognizeBooking(
    booking: PropertyRentalBooking,
    asOf: Date,
  ): Promise<number> {
    const { recognizable, recognizeNow } = computeAccrualRecognition(
      booking,
      asOf,
    );
    if (recognizeNow <= 0) return 0;

    await this.generalLedger.post({
      branchId: booking.branchId,
      occurredAt: asOf,
      sourceType: GlJournalSourceType.REVENUE_ACCRUAL,
      sourceId: String(booking.id),
      idempotencyKey: `accrual-${booking.id}-${Math.round(recognizable * 100)}`,
      currency: booking.currency,
      memo: `Rent recognized — booking ${booking.id}`,
      lines: [
        { accountCode: GlAccountCode.DEFERRED_REVENUE, debit: recognizeNow },
        { accountCode: GlAccountCode.RENTAL_REVENUE, credit: recognizeNow },
      ],
    });

    booking.recognizedAmount = recognizable;
    await this.bookingRepo.save(booking);
    return recognizeNow;
  }
}
