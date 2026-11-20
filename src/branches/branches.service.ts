import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EquityPartnerService } from '../retail/equity-partner.service';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { CreateBranchDto } from './dto/create-branch.dto';
import { User } from '../users/entities/user.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { TenantSubscription } from '../retail/entities/tenant-subscription.entity';
import {
  addCalendarMonths,
  billingStateOf,
  pickCurrentSubscription,
  round2,
  summarizeSubscription,
} from '../retail/subscription-summary';
import {
  TenantBillingInterval,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT } from '../branch-staff/pos-workspace-pricing';

export interface AdminListBranchesQuery {
  search?: string;
  serviceFormat?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface ExtendAdminBranchSubscriptionInput {
  months: number;
  reason: string;
  amountTotal?: number | null;
}

export interface AdminActor {
  id: number | null;
  email: string | null;
}

/**
 * True when a branch's owner account has no way to authenticate at all — no
 * Google link, no Apple link, no password. Admin-provisioned owners start in
 * exactly this state: the row is created with the email the admin typed, and
 * `googleId` is only attached the first time someone signs in with that
 * address.
 *
 * It is worth surfacing because the failure it predicts is silent and
 * expensive. If the owner signs in with a *different* address than the one the
 * branch was provisioned for, that sign-in is a first-time signup with no
 * branches, so `createTrialWorkspaceForNewUser` hands them a brand-new tenant
 * and trial branch of their own. They then report "my branch shows the wrong
 * name" while actually sitting in a second, unrelated workspace, and the branch
 * an admin prepared stays untouched with nobody able to open it. (Asal
 * Printing, 2026-08-01: branch #108 vs auto-provisioned #110.)
 *
 * Deliberately NOT keyed on `User.lastLoginAt` — that column exists but is
 * never written by any login path (verified null for all 1799 prod users), so
 * it would flag every account on the platform.
 */
function ownerHasNoCredentials(owner?: User | null): boolean {
  if (!owner) return false;
  return !owner.googleId && !owner.appleId && !owner.password;
}

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(VendorStore)
    private readonly vendorStoresRepository: Repository<VendorStore>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional()
    private readonly equityPartnerService?: EquityPartnerService,
  ) {}

  async create(dto: CreateBranchDto): Promise<Branch> {
    // Untaxed to start, like every other creation path — the owner switches
    // VAT on in Seller HQ. Written explicitly so the INSERT never depends on
    // whatever the column default happens to be.
    const branch = this.branchesRepository.create({
      ...dto,
      taxEnabled: false,
    });
    return this.branchesRepository.save(branch);
  }

  async findAll(): Promise<Branch[]> {
    return this.branchesRepository.find({
      order: { createdAt: 'DESC' },
      relations: { owner: true },
    });
  }

  async adminListBranches(query: AdminListBranchesQuery = {}) {
    const { search, serviceFormat, isActive, page = 1, limit = 25 } = query;
    const where: Record<string, unknown> = {};

    if (search) {
      where.name = ILike(`%${search}%`);
    }
    if (serviceFormat) {
      where.serviceFormat = serviceFormat;
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [items, total] = await this.branchesRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: { owner: true, retailTenant: true },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Count active/inactive scoped to same search+serviceFormat filters (ignoring isActive filter)
    const countWhere = { ...where } as Record<string, unknown>;
    delete countWhere.isActive;
    const [activeCount, inactiveCount] = await Promise.all([
      this.branchesRepository.count({
        where: { ...countWhere, isActive: true },
      }),
      this.branchesRepository.count({
        where: { ...countWhere, isActive: false },
      }),
    ]);

    const currentSubscriptionOf = await this.loadCurrentSubscriptions(items);
    const now = new Date();

    return {
      // Mutated in place rather than spread into a plain object on purpose: the
      // global ClassSerializerInterceptor relies on these staying Branch
      // instances so the nested owner's @Exclude()'d password is still stripped.
      items: items.map((branch) => {
        const current = currentSubscriptionOf(branch);
        return Object.assign(branch, {
          ownerNeverSignedIn: ownerHasNoCredentials(branch.owner),
          billingState: billingStateOf(current, now),
          subscription: current ? summarizeSubscription(current, now) : null,
        });
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      activeCount,
      inactiveCount,
    };
  }

  /**
   * Resolves each branch's current subscription for the admin list: its own
   * per-branch row when it has one, else a legacy tenant-wide row from before
   * billing moved to the branch.
   */
  private async loadCurrentSubscriptions(
    branches: Branch[],
  ): Promise<(branch: Branch) => TenantSubscription | null> {
    if (!branches.length) return () => null;
    const branchIds = branches.map((b) => b.id);
    const tenantIds = [
      ...new Set(
        branches
          .map((b) => b.retailTenantId)
          .filter((id): id is number => id != null),
      ),
    ];
    const qb = this.dataSource
      .getRepository(TenantSubscription)
      .createQueryBuilder('s')
      .where('s.branchId IN (:...branchIds)', { branchIds });
    if (tenantIds.length) {
      qb.orWhere('(s.branchId IS NULL AND s.tenantId IN (:...tenantIds))', {
        tenantIds,
      });
    }
    const subs = await qb.getMany();

    const byBranch = new Map<number, TenantSubscription[]>();
    const legacyByTenant = new Map<number, TenantSubscription[]>();
    for (const sub of subs) {
      const [map, key] =
        sub.branchId != null
          ? [byBranch, sub.branchId]
          : [legacyByTenant, sub.tenantId];
      const list = map.get(key) ?? [];
      list.push(sub);
      map.set(key, list);
    }

    return (branch) =>
      pickCurrentSubscription(byBranch.get(branch.id) ?? []) ??
      (branch.retailTenantId != null
        ? pickCurrentSubscription(
            legacyByTenant.get(branch.retailTenantId) ?? [],
          )
        : null);
  }

  /**
   * Grants a branch a further paid term by hand — the renewal an admin records
   * when the owner paid outside Ebirr (bank transfer, cash) or is being carried
   * as goodwill.
   *
   * Writes a NEW branch-scoped row rather than stretching the current one, so
   * each term keeps its own dates and price and the history reads as a
   * sequence. Every reader of "which row governs this branch" — the admin list
   * (pickCurrentSubscription: latest startsAt) and the workspace gate
   * (findSubscriptionForBranch: latest createdAt) — picks the newest row, so
   * the branch is served from it at once. The old row lapses on its own.
   *
   * The new term chains from the current period's end while that end is still
   * ahead: paying early never shortens what was already paid for. Once the
   * period has lapsed the term starts now — the gap was not served, so it is
   * not sold.
   *
   * Price: the platform rate (3,900 ETB a month) × months — a branch that
   * started on the retired 1,900 ETB six-month plan renews at today's price,
   * not its old one. An explicit amountTotal (0 for a free extension) overrides
   * it. No Ebirr money moves and no equity payouts are generated: those follow
   * a payment, not an admin grant.
   */
  async extendAdminBranchSubscription(
    id: number,
    input: ExtendAdminBranchSubscriptionInput,
    actor: AdminActor,
  ) {
    const branch = await this.branchesRepository.findOne({
      where: { id },
      relations: { retailTenant: true },
    });
    if (!branch) throw new NotFoundException(`Branch #${id} not found`);
    if (branch.retailTenantId == null) {
      throw new BadRequestException(
        `Branch #${id} is not assigned to a Retail OS tenant; assign it a workspace before extending its subscription.`,
      );
    }

    const months = Number(input.months);
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      throw new BadRequestException(
        'months must be a whole number from 1 to 24',
      );
    }
    const reason = String(input.reason ?? '').trim();
    if (!reason) {
      throw new BadRequestException('A reason is required');
    }
    const explicitTotal =
      input.amountTotal === undefined || input.amountTotal === null
        ? null
        : Number(input.amountTotal);
    if (explicitTotal !== null && !(explicitTotal >= 0)) {
      throw new BadRequestException('amountTotal must be zero or more');
    }

    const currentOf = await this.loadCurrentSubscriptions([branch]);
    const current = currentOf(branch);
    const now = new Date();

    const previousEndsAt = current?.endsAt ? new Date(current.endsAt) : null;
    const chainsFromPreviousEnd =
      previousEndsAt !== null && previousEndsAt.getTime() > now.getTime();
    const startsAt = chainsFromPreviousEnd ? previousEndsAt : now;
    const endsAt = addCalendarMonths(startsAt, months);

    const monthlyRate =
      explicitTotal !== null
        ? round2(explicitTotal / months)
        : POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT;
    const amountTotal =
      explicitTotal !== null
        ? round2(explicitTotal)
        : round2(monthlyRate * months);

    const planCode = months === 12 ? 'POS_BRANCH_1Y' : `POS_BRANCH_${months}M`;
    const billingInterval =
      months === 1
        ? TenantBillingInterval.MONTHLY
        : months === 6
          ? TenantBillingInterval.SIX_MONTHS
          : months === 12
            ? TenantBillingInterval.ONE_YEAR
            : TenantBillingInterval.CUSTOM;
    const currency = current?.currency?.trim() || 'ETB';

    const subscriptionsRepo = this.dataSource.getRepository(TenantSubscription);
    const saved = await subscriptionsRepo.save(
      subscriptionsRepo.create({
        tenantId: branch.retailTenantId,
        branchId: branch.id,
        planCode,
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval,
        amount: monthlyRate,
        amountTotal,
        periodMonths: months,
        currency,
        startsAt,
        endsAt,
        autoRenew: false,
        metadata: {
          posWorkspacePlanCode: planCode,
          periodMonths: months,
          amountTotal,
          branchId: branch.id,
          manualExtension: {
            reason,
            actorId: actor.id,
            actorEmail: actor.email,
            at: now.toISOString(),
            extendsSubscriptionId: current?.id ?? null,
            previousEndsAt: previousEndsAt
              ? previousEndsAt.toISOString()
              : null,
            chainsFromPreviousEnd,
          },
        },
      }),
    );

    // Money collected for a term is money a referring equity partner shares
    // in, whichever way it was collected — a hand-recorded term used to pay
    // them nothing. A free goodwill term (0) creates no payout.
    let equityPayoutsCreated = 0;
    if (amountTotal > 0 && this.equityPartnerService) {
      try {
        const payouts =
          await this.equityPartnerService.createMonthlyPayoutsForBranch(
            branch.id,
            startsAt,
            endsAt,
            amountTotal,
            currency,
          );
        equityPayoutsCreated = payouts?.length ?? 0;
      } catch (err: any) {
        this.logger.warn(
          `Equity payouts for the extension of branch #${branch.id} failed: ${err?.message}`,
        );
      }
    }

    return {
      equityPayoutsCreated,
      branch: {
        id: branch.id,
        name: branch.name,
        retailTenantId: branch.retailTenantId,
      },
      previous: current ? summarizeSubscription(current, now) : null,
      subscription: summarizeSubscription(saved, now),
      billingState: billingStateOf(saved, now),
      chainsFromPreviousEnd,
      amountTotal,
      monthlyRate,
    };
  }

  async patchAdminBranch(
    id: number,
    patch: { isActive?: boolean },
  ): Promise<Branch> {
    const branch = await this.branchesRepository.findOne({
      where: { id },
      relations: { owner: true, retailTenant: true },
    });
    if (!branch) throw new NotFoundException(`Branch #${id} not found`);
    if (patch.isActive !== undefined) {
      branch.isActive = patch.isActive;
      // Mirror activation state to the linked VendorStore so the store
      // appears/disappears from consumer listings accordingly.
      if (branch.vendorStoreId) {
        await this.vendorStoresRepository.update(
          { id: branch.vendorStoreId },
          { isConsumerVisible: patch.isActive },
        );
      }
    }
    return this.branchesRepository.save(branch);
  }

  /**
   * Sync VendorStore name and serviceFormat whenever a branch is renamed or its
   * serviceFormat changes. Called by seller-workspace.service after saving a branch.
   */
  async syncVendorStore(
    branchId: number,
    patch: { storeName?: string; serviceFormat?: string | null },
  ): Promise<void> {
    const store = await this.vendorStoresRepository.findOne({
      where: { branchId },
    });
    if (!store) return;
    const update: Partial<VendorStore> = {};
    if (patch.storeName !== undefined) update.storeName = patch.storeName;
    if (patch.serviceFormat !== undefined)
      update.serviceFormat = patch.serviceFormat;
    if (Object.keys(update).length) {
      await this.vendorStoresRepository.update({ id: store.id }, update);
    }
  }

  /**
   * Count OUTSTANDING equity BNPL activations pinned to the given branches.
   * Deleting such a branch would leave the obligation as a ghost row, so it is
   * blocked unless the caller opts into manual settlement. Returns a per-branch
   * breakdown so the caller can build a clear error.
   */
  private async findOutstandingObligations(
    ids: number[],
  ): Promise<Array<{ branchId: number; count: number }>> {
    if (!ids.length) return [];
    const rows = await this.dataSource.query(
      `SELECT "branchId" AS "branchId", COUNT(*)::int AS count
         FROM equity_partner_bnpl_activations
        WHERE status = 'OUTSTANDING' AND "branchId" = ANY($1)
        GROUP BY "branchId"`,
      [ids],
    );
    return rows.map((r: { branchId: number; count: number }) => ({
      branchId: Number(r.branchId),
      count: Number(r.count),
    }));
  }

  /**
   * Write off (FORGIVEN) every OUTSTANDING activation + credit-ledger entry
   * pinned to a branch — the admin override behind "settle & delete". No money
   * is collected here, so the obligation is marked FORGIVEN (a write-off), NOT
   * SETTLED (paid): marking it SETTLED would inflate collected revenue and hide
   * an uncollected debt in reporting. Must run before the branch row is removed:
   * the FK nulls `branchId` on delete, after which these WHERE clauses would no
   * longer match.
   */
  private async writeOffBranchObligations(
    manager: EntityManager,
    branchId: number,
  ): Promise<void> {
    const reference = `MANUAL-WRITEOFF-${branchId}-${Date.now()}`;
    await manager.query(
      `UPDATE equity_partner_bnpl_activations
          SET status = 'FORGIVEN',
              "settledAt" = now(),
              "settlementReferenceId" = COALESCE("settlementReferenceId", $2),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'manualWriteOff',
                jsonb_build_object('by', 'admin', 'at', now()::text, 'reason', 'branch-delete')
              )
        WHERE "branchId" = $1 AND status = 'OUTSTANDING'`,
      [branchId, reference],
    );
    await manager.query(
      `UPDATE equity_partner_bnpl_credit_ledger
          SET "activationStatus" = 'FORGIVEN',
              "settlementReferenceId" = COALESCE("settlementReferenceId", $2)
        WHERE "branchId" = $1 AND "activationStatus" = 'OUTSTANDING'`,
      [branchId, reference],
    );
  }

  async deleteAdminBranch(
    id: number,
    opts: { settleOutstanding?: boolean } = {},
  ): Promise<void> {
    const branch = await this.branchesRepository.findOne({ where: { id } });
    if (!branch) throw new NotFoundException(`Branch #${id} not found`);

    const total = (await this.findOutstandingObligations([id])).reduce(
      (sum, o) => sum + o.count,
      0,
    );
    if (total > 0 && !opts.settleOutstanding) {
      throw new BadRequestException(
        `Branch #${id} has ${total} outstanding BNPL activation(s). ` +
          `Settle or cancel them first, or delete with manual settlement.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (opts.settleOutstanding && total > 0) {
        await this.writeOffBranchObligations(manager, id);
      }
      // DB-level ON DELETE CASCADE / SET NULL handles all dependents.
      await manager.delete(Branch, id);
    });
  }

  async bulkDeleteAdminBranches(
    ids: number[],
    opts: { settleOutstanding?: boolean } = {},
  ): Promise<number> {
    if (!ids.length) return 0;

    const outstanding = await this.findOutstandingObligations(ids);
    if (outstanding.length && !opts.settleOutstanding) {
      const detail = outstanding
        .map((o) => `#${o.branchId} (${o.count})`)
        .join(', ');
      throw new BadRequestException(
        `Cannot delete: branch(es) ${detail} have outstanding BNPL activation(s). ` +
          `Settle or cancel them first, or delete with manual settlement.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      if (opts.settleOutstanding) {
        for (const o of outstanding) {
          await this.writeOffBranchObligations(manager, o.branchId);
        }
      }
      const result = await manager.delete(Branch, ids);
      return typeof result.affected === 'number' ? result.affected : ids.length;
    });
  }
}
