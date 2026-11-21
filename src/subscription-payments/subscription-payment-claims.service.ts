import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SubscriptionPaymentClaim,
  SubscriptionPaymentClaimKind,
  SubscriptionPaymentClaimStatus,
} from './entities/subscription-payment-claim.entity';
import {
  SUBSCRIPTION_PAYMENT_DESTINATIONS,
  findSubscriptionPaymentDestination,
} from './payment-destinations';

export interface PaymentProof {
  channel: string;
  payerReference: string;
  payerName?: string | null;
  receiptUrl?: string | null;
}

export interface SubmitPaymentClaimInput extends PaymentProof {
  referenceId: string;
  kind: SubscriptionPaymentClaimKind;
  userId: number;
  amount: number;
  currency?: string | null;
  branchId?: number | null;
  tenantId?: number | null;
  supplierProfileId?: number | null;
  bnplActivationId?: number | null;
  subjectName?: string | null;
  period?: string | null;
  periodMonths?: number | null;
}

/** What a caller must present to a customer who has just submitted proof. */
export interface PaymentClaimReceiptForCustomer {
  claimId: number;
  referenceId: string;
  status: 'PENDING_VERIFICATION';
  amount: number;
  currency: string;
  channel: string;
  payerReference: string;
  message: string;
}

/**
 * Subscription payments made by transfer. Holds the claim ledger only — it
 * grants nothing. Granting happens when an admin approves a claim, in
 * SubscriptionPaymentReviewService, which calls the same completion code a
 * confirmed payment has always run.
 */
@Injectable()
export class SubscriptionPaymentClaimsService {
  constructor(
    @InjectRepository(SubscriptionPaymentClaim)
    private readonly claimsRepo: Repository<SubscriptionPaymentClaim>,
  ) {}

  destinations() {
    return SUBSCRIPTION_PAYMENT_DESTINATIONS.map((entry) => ({ ...entry }));
  }

  /**
   * Check the proof BEFORE a caller writes anything else, so a bad channel or a
   * re-used transaction number never leaves half a pending activation behind.
   */
  async assertProofAcceptable(
    proof: PaymentProof,
    target: {
      kind: SubscriptionPaymentClaimKind;
      branchId?: number | null;
      supplierProfileId?: number | null;
      bnplActivationId?: number | null;
      tenantId?: number | null;
      userId?: number | null;
    },
  ): Promise<void> {
    const destination = findSubscriptionPaymentDestination(proof?.channel);
    if (!destination) {
      throw new BadRequestException(
        `Choose how you paid: ${SUBSCRIPTION_PAYMENT_DESTINATIONS.map((d) => d.label).join(' or ')}.`,
      );
    }
    const payerReference = this.normalizeReference(proof?.payerReference);
    if (payerReference.length < 4) {
      throw new BadRequestException(
        'Enter the transaction number from your payment receipt.',
      );
    }

    const reused = await this.claimsRepo
      .createQueryBuilder('claim')
      .where('claim.channel = :channel', { channel: destination.channel })
      .andWhere('UPPER(claim.payerReference) = :ref', {
        ref: payerReference.toUpperCase(),
      })
      .andWhere('claim.status <> :rejected', { rejected: 'REJECTED' })
      .getOne();
    if (reused) {
      throw new ConflictException(
        'This transaction number has already been submitted for a payment. Each transfer can pay for one thing only.',
      );
    }

    // One claim awaiting review per thing being paid for.
    const open = await this.findOpenClaimFor(target);
    if (open) {
      throw new ConflictException(
        'A payment for this is already waiting to be verified. You will be notified as soon as it is checked.',
      );
    }
  }

  async findOpenClaimFor(target: {
    kind: SubscriptionPaymentClaimKind;
    branchId?: number | null;
    supplierProfileId?: number | null;
    bnplActivationId?: number | null;
    tenantId?: number | null;
    userId?: number | null;
  }): Promise<SubscriptionPaymentClaim | null> {
    const where: Record<string, unknown> = {
      kind: target.kind,
      status: 'SUBMITTED',
    };
    if (target.kind === 'POS_BRANCH') where.branchId = target.branchId;
    else if (target.kind === 'SUPPLIER')
      where.supplierProfileId = target.supplierProfileId;
    else if (target.kind === 'BNPL')
      where.bnplActivationId = target.bnplActivationId;
    else {
      where.tenantId = target.tenantId;
      where.userId = target.userId;
    }
    // A missing id would drop out of the query and match somebody else's claim.
    if (Object.values(where).some((value) => value == null)) return null;
    return this.claimsRepo.findOne({ where, order: { createdAt: 'DESC' } });
  }

  async submit(
    input: SubmitPaymentClaimInput,
  ): Promise<SubscriptionPaymentClaim> {
    const destination = findSubscriptionPaymentDestination(input.channel);
    if (!destination) {
      throw new BadRequestException('Unknown payment channel.');
    }
    if (!(Number(input.amount) > 0)) {
      throw new BadRequestException('A payment claim needs an amount.');
    }
    return this.claimsRepo.save(
      this.claimsRepo.create({
        referenceId: input.referenceId,
        kind: input.kind,
        status: 'SUBMITTED',
        userId: input.userId,
        branchId: input.branchId ?? null,
        tenantId: input.tenantId ?? null,
        supplierProfileId: input.supplierProfileId ?? null,
        bnplActivationId: input.bnplActivationId ?? null,
        subjectName: input.subjectName?.slice(0, 160) ?? null,
        period: input.period ?? null,
        periodMonths: input.periodMonths ?? null,
        amount: Number(input.amount),
        currency: input.currency || 'ETB',
        channel: destination.channel,
        payerReference: this.normalizeReference(input.payerReference),
        payerName: input.payerName?.trim().slice(0, 120) || null,
        receiptUrl: input.receiptUrl?.trim() || null,
      }),
    );
  }

  /** The reply every "I have paid" endpoint gives the customer. */
  describeForCustomer(
    claim: SubscriptionPaymentClaim,
  ): PaymentClaimReceiptForCustomer {
    return {
      claimId: claim.id,
      referenceId: claim.referenceId,
      status: 'PENDING_VERIFICATION',
      amount: Number(claim.amount),
      currency: claim.currency,
      channel: claim.channel,
      payerReference: claim.payerReference,
      message:
        'Payment submitted. We will check it against our account and confirm — you will be notified, usually within a working day.',
    };
  }

  findByReference(
    referenceId: string,
  ): Promise<SubscriptionPaymentClaim | null> {
    return this.claimsRepo.findOne({ where: { referenceId } });
  }

  async findByIdOrFail(id: number): Promise<SubscriptionPaymentClaim> {
    const claim = await this.claimsRepo.findOne({ where: { id } });
    if (!claim) throw new NotFoundException(`Payment #${id} not found.`);
    return claim;
  }

  listForBranch(branchId: number): Promise<SubscriptionPaymentClaim[]> {
    return this.claimsRepo.find({
      where: { branchId, kind: 'POS_BRANCH' },
      order: { createdAt: 'DESC' },
    });
  }

  listForBranches(branchIds: number[]): Promise<SubscriptionPaymentClaim[]> {
    if (!branchIds.length) return Promise.resolve([]);
    return this.claimsRepo.find({
      where: { branchId: In(branchIds), kind: 'POS_BRANCH' },
      order: { createdAt: 'DESC' },
    });
  }

  listForSupplier(
    supplierProfileId: number,
  ): Promise<SubscriptionPaymentClaim[]> {
    return this.claimsRepo.find({
      where: { supplierProfileId, kind: 'SUPPLIER' },
      order: { createdAt: 'DESC' },
    });
  }

  async listForAdmin(filter: {
    status?: SubscriptionPaymentClaimStatus | 'ALL';
    limit?: number;
  }): Promise<SubscriptionPaymentClaim[]> {
    const status =
      filter.status && filter.status !== 'ALL' ? filter.status : null;
    return this.claimsRepo.find({
      where: status ? { status } : {},
      // The queue is worked oldest first; history reads newest first.
      order: { createdAt: status === 'SUBMITTED' ? 'ASC' : 'DESC' },
      take: Math.min(Math.max(filter.limit ?? 200, 1), 500),
    });
  }

  listAll(): Promise<SubscriptionPaymentClaim[]> {
    return this.claimsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async markReviewed(
    claim: SubscriptionPaymentClaim,
    outcome: 'APPROVED' | 'REJECTED',
    reviewer: { id: number },
    note?: string | null,
  ): Promise<SubscriptionPaymentClaim> {
    claim.status = outcome;
    claim.reviewedByUserId = reviewer.id;
    claim.reviewedAt = new Date();
    claim.reviewNote = note?.trim().slice(0, 500) || null;
    return this.claimsRepo.save(claim);
  }

  private normalizeReference(value: string | null | undefined): string {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80);
  }
}
