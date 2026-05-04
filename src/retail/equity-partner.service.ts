import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Or, Repository } from 'typeorm';
import {
  EquityPartner,
  EquityPartnerStatus,
} from './entities/equity-partner.entity';
import { EquitySplitAssignment } from './entities/equity-split-assignment.entity';
import {
  EquityPayout,
  EquityPayoutStatus,
} from './entities/equity-payout.entity';
import {
  ApplyEquityPartnerDto,
  UpdateEquityPartnerDto,
  UpdateEquitySplitAssignmentDto,
} from './dto/equity-partner.dto';

const BRANCH_MONTHLY_PRICE = 1900;
const SPLIT_NUMERATOR = 1;
const SPLIT_DENOMINATOR = 3;
const PARTNER_SPLIT_AMOUNT = Math.floor(
  (BRANCH_MONTHLY_PRICE * SPLIT_NUMERATOR) / SPLIT_DENOMINATOR,
); // 633

/** Public pricing constants exposed for the seller dashboard / referral copy. */
export const EQUITY_PRICING = {
  branchMonthlyPrice: BRANCH_MONTHLY_PRICE,
  splitNumerator: SPLIT_NUMERATOR,
  splitDenominator: SPLIT_DENOMINATOR,
  partnerMonthlyEquivalent: PARTNER_SPLIT_AMOUNT,
  currency: 'ETB',
} as const;

/** Generate PART-XXXX style referral codes. */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `PART-${suffix}`;
}

@Injectable()
export class EquityPartnerService {
  constructor(
    @InjectRepository(EquityPartner)
    private readonly partnersRepo: Repository<EquityPartner>,
    @InjectRepository(EquitySplitAssignment)
    private readonly assignmentsRepo: Repository<EquitySplitAssignment>,
    @InjectRepository(EquityPayout)
    private readonly payoutsRepo: Repository<EquityPayout>,
  ) {}

  // ---------------------------------------------------------------------------
  // Seller self-service
  // ---------------------------------------------------------------------------

  /** Apply for the equity partner program (seller side). */
  async applyForPartnership(
    userId: number,
    dto: ApplyEquityPartnerDto,
  ): Promise<EquityPartner> {
    const existing = await this.partnersRepo.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException(
        'You have already submitted an equity partner application.',
      );
    }
    const partner = this.partnersRepo.create({
      userId,
      displayName: dto.displayName,
      phone: dto.phone,
      bankAccountInfo: dto.bankAccountInfo ?? null,
      status: EquityPartnerStatus.PENDING,
    });
    return this.partnersRepo.save(partner);
  }

  /** Return the partner profile for the authenticated seller. */
  async getSellerProfile(userId: number): Promise<EquityPartner | null> {
    return this.partnersRepo.findOne({
      where: { userId },
      relations: ['assignments', 'assignments.branch'],
    });
  }

  /**
   * Dashboard data for an ACTIVE partner:
   * referral code, linked branches with their details, payout summary.
   */
  async getSellerDashboard(userId: number): Promise<{
    referralCode: string | null;
    assignmentCount: number;
    totalPendingPayout: number;
    totalPaidPayout: number;
    assignments: {
      branchId: number;
      branchName: string;
      assignedAt: Date;
      monthlyEarning: number;
    }[];
    payouts: Array<EquityPayout & { branchName: string }>;
  }> {
    const partner = await this.partnersRepo.findOne({
      where: { userId },
      relations: ['assignments', 'assignments.branch'],
    });
    if (!partner) {
      throw new NotFoundException('No equity partner profile found.');
    }

    const payouts = await this.payoutsRepo.find({
      where: { equityPartnerId: partner.id },
      relations: ['branch'],
      order: { createdAt: 'DESC' },
    });

    const totalPendingPayout = payouts
      .filter((p) => p.status === EquityPayoutStatus.PENDING)
      .reduce((sum, p) => sum + Number(p.splitAmount), 0);

    const totalPaidPayout = payouts
      .filter((p) => p.status === EquityPayoutStatus.PAID)
      .reduce((sum, p) => sum + Number(p.splitAmount), 0);

    return {
      referralCode: partner.referralCode ?? null,
      assignmentCount: partner.assignments?.length ?? 0,
      totalPendingPayout,
      totalPaidPayout,
      assignments: (partner.assignments ?? []).map((a) => ({
        branchId: a.branchId,
        branchName: a.branch?.name ?? `Branch #${a.branchId}`,
        assignedAt: a.assignedAt,
        monthlyEarning: Math.floor(
          (BRANCH_MONTHLY_PRICE * a.splitNumerator) / a.splitDenominator,
        ),
      })),
      payouts: payouts.map((payout) => ({
        ...payout,
        branchName: payout.branch?.name ?? `Branch #${payout.branchId}`,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Admin operations
  // ---------------------------------------------------------------------------

  async listPartners(filter?: {
    status?: EquityPartnerStatus;
  }): Promise<EquityPartner[]> {
    const where = filter?.status ? { status: filter.status } : {};
    const partners = await this.partnersRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    // Enrich with assignmentCount computed from DB
    const ids = partners.map((p) => p.id);
    if (!ids.length) return partners;

    const counts: { equityPartnerId: number; count: string }[] =
      await this.assignmentsRepo
        .createQueryBuilder('a')
        .select('a."equityPartnerId"', 'equityPartnerId')
        .addSelect('COUNT(a.id)', 'count')
        .where('a."equityPartnerId" IN (:...ids)', { ids })
        .groupBy('a."equityPartnerId"')
        .getRawMany();

    const countMap = new Map(
      counts.map((r) => [r.equityPartnerId, Number(r.count)]),
    );

    return partners.map((p) => ({
      ...p,
      assignmentCount: countMap.get(p.id) ?? 0,
    })) as any;
  }

  async getPartnerById(id: number): Promise<EquityPartner> {
    const partner = await this.partnersRepo.findOne({
      where: { id },
      relations: ['assignments', 'assignments.branch'],
    });
    if (!partner)
      throw new NotFoundException(`Equity partner #${id} not found`);
    return partner;
  }

  async updatePartner(
    id: number,
    dto: UpdateEquityPartnerDto,
  ): Promise<EquityPartner> {
    const partner = await this.getPartnerById(id);

    const wasApproved =
      dto.status === EquityPartnerStatus.ACTIVE &&
      partner.status !== EquityPartnerStatus.ACTIVE;

    if (dto.status !== undefined) partner.status = dto.status;
    if (dto.bankAccountInfo !== undefined)
      partner.bankAccountInfo = dto.bankAccountInfo;
    if (dto.notes !== undefined) partner.notes = dto.notes;
    if (dto.tierNumerator !== undefined)
      partner.tierNumerator = dto.tierNumerator;
    if (dto.tierDenominator !== undefined)
      partner.tierDenominator = dto.tierDenominator;
    if (dto.referrerEquityPartnerId !== undefined) {
      if (dto.referrerEquityPartnerId === partner.id) {
        throw new BadRequestException(
          'A partner cannot reference themselves as referrer.',
        );
      }
      const referrer = await this.partnersRepo.findOne({
        where: { id: dto.referrerEquityPartnerId },
      });
      if (!referrer) {
        throw new NotFoundException(
          `Referrer equity partner #${dto.referrerEquityPartnerId} not found.`,
        );
      }
      partner.referrerEquityPartnerId = dto.referrerEquityPartnerId;
    }

    // Generate referral code on first approval
    if (wasApproved && !partner.referralCode) {
      partner.referralCode = await this.generateUniqueReferralCode();
    }

    return this.partnersRepo.save(partner);
  }

  async listPayouts(
    partnerId: number,
    filters: {
      status?: EquityPayoutStatus;
      from?: Date;
      to?: Date;
    } = {},
  ): Promise<EquityPayout[]> {
    // Verify partner exists
    const exists = await this.partnersRepo.count({ where: { id: partnerId } });
    if (!exists)
      throw new NotFoundException(`Equity partner #${partnerId} not found`);

    const qb = this.payoutsRepo
      .createQueryBuilder('p')
      .where('p.equityPartnerId = :partnerId', { partnerId })
      .orderBy('p.createdAt', 'DESC');

    if (filters.status) {
      qb.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters.from) {
      qb.andWhere('p.billingPeriodStart >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('p.billingPeriodEnd <= :to', { to: filters.to });
    }
    return qb.getMany();
  }

  /** Cross-partner payout listing (admin only) with optional filters. */
  async listAllPayouts(
    filters: {
      status?: EquityPayoutStatus;
      partnerId?: number;
      from?: Date;
      to?: Date;
    } = {},
  ): Promise<EquityPayout[]> {
    const qb = this.payoutsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.partner', 'partner')
      .orderBy('p.createdAt', 'DESC');

    if (filters.status) {
      qb.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters.partnerId) {
      qb.andWhere('p.equityPartnerId = :partnerId', {
        partnerId: filters.partnerId,
      });
    }
    if (filters.from) {
      qb.andWhere('p.billingPeriodStart >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('p.billingPeriodEnd <= :to', { to: filters.to });
    }
    return qb.getMany();
  }

  async markPayoutPaid(
    partnerId: number,
    payoutId: number,
    notes?: string,
  ): Promise<EquityPayout> {
    const payout = await this.payoutsRepo.findOne({
      where: { id: payoutId, equityPartnerId: partnerId },
    });
    if (!payout) {
      throw new NotFoundException(
        `Payout #${payoutId} not found for partner #${partnerId}`,
      );
    }
    if (payout.status !== EquityPayoutStatus.PENDING) {
      throw new BadRequestException(
        `Payout #${payoutId} is already ${payout.status}.`,
      );
    }
    payout.status = EquityPayoutStatus.PAID;
    payout.paidAt = new Date();
    if (notes) payout.notes = notes;
    return this.payoutsRepo.save(payout);
  }

  // ---------------------------------------------------------------------------
  // Called by SellerWorkspaceService during branch creation
  // ---------------------------------------------------------------------------

  /**
   * Look up an ACTIVE equity partner by referral code.
   * Returns null if code is not found (so the caller can decide whether to fail
   * or silently ignore an unrecognised code).
   */
  async findActivePartnerByReferralCode(
    code: string,
  ): Promise<EquityPartner | null> {
    return this.partnersRepo.findOne({
      where: {
        referralCode: code.trim().toUpperCase(),
        status: EquityPartnerStatus.ACTIVE,
      },
    });
  }

  /**
   * Create a split assignment linking a branch to an equity partner.
   * Called inside the branch-creation transaction (using the provided manager's
   * repository) — but since we're injecting a separate repo here we accept the
   * entity manager's save function to keep things transactional.
   */
  async createAssignment(
    equityPartnerId: number,
    branchId: number,
    retailTenantId: number | null,
  ): Promise<EquitySplitAssignment> {
    const assignment = this.assignmentsRepo.create({
      equityPartnerId,
      branchId,
      retailTenantId,
      splitNumerator: SPLIT_NUMERATOR,
      splitDenominator: SPLIT_DENOMINATOR,
    });
    return this.assignmentsRepo.save(assignment);
  }

  /**
   * Generate a monthly payout for all active assignments on a given branch.
   * Call this when a branch subscription payment succeeds.
   */
  async createMonthlyPayoutsForBranch(
    branchId: number,
    billingPeriodStart: Date,
    billingPeriodEnd: Date,
    grossAmount = BRANCH_MONTHLY_PRICE,
    currency = 'ETB',
  ): Promise<EquityPayout[]> {
    const assignments = await this.assignmentsRepo.find({
      where: { branchId },
      relations: ['partner'],
    });

    const activeAssignments = assignments.filter(
      (a) =>
        a.partner?.status === EquityPartnerStatus.ACTIVE &&
        (!a.activeUntil || a.activeUntil > billingPeriodStart),
    );

    if (!activeAssignments.length) return [];

    const payouts = activeAssignments.map((a) =>
      this.payoutsRepo.create({
        equityPartnerId: a.equityPartnerId,
        branchId,
        billingPeriodStart,
        billingPeriodEnd,
        grossAmount,
        splitAmount: Math.floor(
          (grossAmount * a.splitNumerator) / a.splitDenominator,
        ),
        currency,
        status: EquityPayoutStatus.PENDING,
      }),
    );

    const savedPayouts = await this.payoutsRepo.save(payouts);

    // Cascade: for each primary payout, emit a smaller tier payout to the
    // partner that referred this partner (one tier deep). This is what makes
    // the "refer a partner" loop pay out automatically.
    const cascadePayouts: EquityPayout[] = [];
    for (let i = 0; i < activeAssignments.length; i++) {
      const assignment = activeAssignments[i];
      const primary = savedPayouts[i];
      const partner = assignment.partner;
      if (!partner?.referrerEquityPartnerId) continue;
      const tierNum = partner.tierNumerator ?? 1;
      const tierDen = partner.tierDenominator ?? 10;
      if (tierDen <= 0 || tierNum <= 0) continue;
      const cascadeAmount = Math.floor(
        (Number(primary.splitAmount) * tierNum) / tierDen,
      );
      if (cascadeAmount <= 0) continue;
      const referrer = await this.partnersRepo.findOne({
        where: { id: partner.referrerEquityPartnerId },
      });
      if (!referrer || referrer.status !== EquityPartnerStatus.ACTIVE) continue;
      cascadePayouts.push(
        this.payoutsRepo.create({
          equityPartnerId: referrer.id,
          branchId,
          billingPeriodStart,
          billingPeriodEnd,
          grossAmount: Number(primary.splitAmount),
          splitAmount: cascadeAmount,
          currency,
          status: EquityPayoutStatus.PENDING,
          notes: `Cascade payout from partner #${partner.id} (${tierNum}/${tierDen} of ${primary.splitAmount} ${currency}).`,
        }),
      );
    }
    if (cascadePayouts.length) {
      await this.payoutsRepo.save(cascadePayouts);
    }

    return savedPayouts;
  }

  /**
   * Link a branch to an active equity partner discovered through a referral
   * code on POS workspace activation. Skips silently if an assignment already
   * exists (idempotent — Ebirr callbacks may retry).
   */
  async recordReferralFromActivation(
    equityPartnerId: number,
    branchId: number,
    retailTenantId: number | null,
  ): Promise<EquitySplitAssignment | null> {
    const existing = await this.assignmentsRepo.findOne({
      where: { equityPartnerId, branchId },
    });
    if (existing) return existing;
    return this.createAssignment(equityPartnerId, branchId, retailTenantId);
  }

  /** Update split numerator/denominator on a single assignment (admin only). */
  async updateAssignmentSplit(
    partnerId: number,
    assignmentId: number,
    dto: UpdateEquitySplitAssignmentDto,
  ): Promise<EquitySplitAssignment> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { id: assignmentId, equityPartnerId: partnerId },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Assignment #${assignmentId} not found for partner #${partnerId}.`,
      );
    }
    if (dto.splitNumerator !== undefined)
      assignment.splitNumerator = dto.splitNumerator;
    if (dto.splitDenominator !== undefined)
      assignment.splitDenominator = dto.splitDenominator;
    if (assignment.splitNumerator > assignment.splitDenominator) {
      throw new BadRequestException(
        'Split numerator cannot exceed denominator.',
      );
    }
    return this.assignmentsRepo.save(assignment);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async generateUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateReferralCode();
      const existing = await this.partnersRepo.findOne({
        where: { referralCode: code },
      });
      if (!existing) return code;
    }
    throw new Error(
      'Failed to generate a unique referral code after 20 attempts',
    );
  }
}
