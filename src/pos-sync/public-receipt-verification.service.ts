import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from './entities/pos-checkout.entity';
import {
  formatReceiptVerificationCode,
  normalizeReceiptVerificationCode,
} from './receipt-verification-code';

/**
 * What a scanned receipt QR resolves to.
 *
 * VALID              settled on our books, nothing reversed
 * PARTIALLY_REFUNDED some of it has come back as a RETURN
 * REFUNDED           all of it has
 * VOIDED             cancelled after the fact
 * PENDING            reached us but never finished processing — the receipt is
 *                    real paper the books have not fully recognised
 */
export type PublicReceiptStatus =
  | 'VALID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'VOIDED'
  | 'PENDING';

export interface PublicReceiptVerificationResult {
  found: boolean;
  code?: string;
  displayCode?: string;
  status?: PublicReceiptStatus;
  documentType?: PosCheckoutTransactionType;
  receiptNumber?: string | null;
  currency?: string;
  total?: number;
  tipAmount?: number;
  refundedAmount?: number;
  itemCount?: number;
  issuedAt?: string | null;
  recordedAt?: string | null;
  branch?: { name: string; city: string | null };
  /** For a RETURN document: the sale it reverses. */
  sourceReceiptNumber?: string | null;
}

/**
 * Resolves the opaque token printed as a receipt QR, for anyone holding the
 * paper — no authentication, so this is the one POS surface a stranger can
 * read. Everything it returns is either already printed on the receipt the
 * caller is holding (branch, total, time) or a statement about that receipt's
 * standing. Deliberately absent: line items, customer name and phone, cashier,
 * register session, branch id, and any other checkout the token did not name.
 */
@Injectable()
export class PublicReceiptVerificationService {
  private readonly logger = new Logger(PublicReceiptVerificationService.name);

  constructor(
    @InjectRepository(PosCheckout)
    private readonly posCheckoutsRepository: Repository<PosCheckout>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
  ) {}

  async verify(rawCode: string): Promise<PublicReceiptVerificationResult> {
    const code = normalizeReceiptVerificationCode(rawCode);
    if (!code) {
      return { found: false };
    }

    const checkout = await this.posCheckoutsRepository.findOne({
      where: { verificationCode: code },
    });
    if (!checkout) {
      // Worth a breadcrumb: a well-formed token that resolves to nothing is
      // either a receipt whose sale never reached us, or someone probing.
      this.logger.debug(`Receipt verification miss for code ${code}`);
      return { found: false };
    }

    const branch = await this.branchesRepository.findOne({
      where: { id: checkout.branchId },
      select: { id: true, name: true, city: true },
    });

    const refundedAmount = await this.sumRefunds(checkout);
    const total = Number(checkout.total ?? 0);

    return {
      found: true,
      code,
      displayCode: formatReceiptVerificationCode(code),
      status: this.resolveStatus(checkout, total, refundedAmount),
      documentType: checkout.transactionType,
      receiptNumber: checkout.receiptNumber ?? null,
      currency: checkout.currency,
      total,
      tipAmount: Number(checkout.tipAmount ?? 0),
      refundedAmount,
      itemCount: checkout.itemCount ?? 0,
      issuedAt: this.toIso(checkout.occurredAt),
      recordedAt: this.toIso(checkout.createdAt),
      branch: { name: branch?.name ?? 'SUUQ POS', city: branch?.city ?? null },
      sourceReceiptNumber:
        checkout.metadata?.returnContext?.sourceReceiptNumber ?? null,
    };
  }

  /**
   * Refunds are RETURN checkouts that name this receipt — they carry a POSITIVE
   * total (the amount handed back), so this sums rather than subtracts. Only a
   * settled, un-voided return counts against the sale.
   */
  private async sumRefunds(checkout: PosCheckout): Promise<number> {
    if (
      checkout.transactionType !== PosCheckoutTransactionType.SALE ||
      !checkout.receiptNumber
    ) {
      return 0;
    }

    const returns = await this.posCheckoutsRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.total), 0)', 'refunded')
      .where('c.branchId = :branchId', { branchId: checkout.branchId })
      .andWhere('c.transactionType = :t', {
        t: PosCheckoutTransactionType.RETURN,
      })
      .andWhere('c.status = :s', { s: PosCheckoutStatus.PROCESSED })
      .andWhere('c."voidedAt" IS NULL')
      .andWhere(
        "c.metadata -> 'returnContext' ->> 'sourceReceiptNumber' = :rn",
        { rn: checkout.receiptNumber },
      )
      .getRawOne<{ refunded: string }>();

    return Math.round(Number(returns?.refunded ?? 0) * 100) / 100;
  }

  private resolveStatus(
    checkout: PosCheckout,
    total: number,
    refundedAmount: number,
  ): PublicReceiptStatus {
    if (checkout.voidedAt || checkout.status === PosCheckoutStatus.VOIDED) {
      return 'VOIDED';
    }
    if (checkout.status !== PosCheckoutStatus.PROCESSED) {
      return 'PENDING';
    }
    if (refundedAmount > 0) {
      // Tolerate rounding on the reversal side rather than reporting a fully
      // refunded sale as "partially" over a one-cent gap.
      return refundedAmount >= total - 0.01 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }
    return 'VALID';
  }

  private toIso(value?: Date | string | null): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
