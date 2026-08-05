import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { linkBranchToVendorStore } from '../branches/branch-store-link';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import {
  RetailTenant,
  RetailTenantStatus,
} from '../retail/entities/retail-tenant.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../retail/entities/tenant-module-entitlement.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import {
  SupplierOffer,
  SupplierOfferStatus,
} from '../supplier-offers/entities/supplier-offer.entity';
import {
  SupplierActivationStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';

/**
 * The register experience code a supplier outlet runs on — a RETAIL-format cash
 * & carry counter. Mirrors the WHOLESALE_COUNTER preset in the pos-s frontend
 * (POS_EXPERIENCE_MATRIX / hospitalityProfiles). Stored on the outlet owner's
 * branch-staff assignment and surfaced on the supplier context.
 */
export const WHOLESALE_COUNTER_PROFILE_CODE = 'WHOLESALE_COUNTER';
/** Plan code stamped on the (free, bundled) outlet subscription. */
const SUPPLIER_OUTLET_PLAN_CODE = 'SUPPLIER_OUTLET_BUNDLED';
/** Advisory-lock namespace serialising concurrent outlet provisioning. */
const SUPPLIER_OUTLET_LOCK_NAMESPACE = 101;
const TEN_YEARS_MS = 10 * 365 * 86_400_000;

/**
 * Provisions and maintains a wholesale Supplier's backing "cash & carry" outlet
 * — the branch its Suuq POS counter runs against. The counter reuses the entire
 * branch-scoped POS machinery, so the outlet is provisioned as a fully-entitled
 * (but free, bundled) retail workspace: its own retail tenant + ACTIVE
 * subscription + POS_CORE/INVENTORY_CORE entitlements + a RETAIL branch owned by
 * the supplier user + an owner MANAGER assignment on the WHOLESALE_COUNTER lane.
 * That way every existing POS guard (RolesGuard via effective-user-role,
 * RetailModulesGuard, PosBranchAccessGuard) passes unchanged.
 *
 * Published supplier offers are mirrored into the outlet catalog (catalog link +
 * seeded branch_inventory) so the register lists the supplier's own SKUs.
 *
 * Everything here is idempotent and advisory-locked so it can run on every
 * activation and re-sync safely.
 */
@Injectable()
export class SupplierOutletService {
  private readonly logger = new Logger(SupplierOutletService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Look up an active outlet branch for a single supplier profile. */
  async getOutletBranchForProfile(
    supplierProfileId: number,
  ): Promise<Branch | null> {
    if (!supplierProfileId) return null;
    return this.dataSource.getRepository(Branch).findOne({
      where: { supplierOutletProfileId: supplierProfileId, isActive: true },
    });
  }

  /** Batch-resolve active outlet branches keyed by supplier profile id. */
  async getOutletBranchesForProfiles(
    supplierProfileIds: number[],
  ): Promise<Map<number, Branch>> {
    const ids = Array.from(
      new Set(
        supplierProfileIds.filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    const map = new Map<number, Branch>();
    if (!ids.length) return map;

    const branches = await this.dataSource
      .getRepository(Branch)
      .createQueryBuilder('branch')
      .where('branch.supplierOutletProfileId IN (:...ids)', { ids })
      .andWhere('branch.isActive = true')
      .getMany();

    for (const branch of branches) {
      const profileId = branch.supplierOutletProfileId;
      if (profileId && !map.has(profileId)) {
        map.set(profileId, branch);
      }
    }
    return map;
  }

  /**
   * Ensure the outlet (workspace + branch + assignment + mirrored catalog) exists
   * for an ACTIVE supplier. Idempotent: returns the existing outlet untouched
   * (apart from a catalog re-sync) when already provisioned. Returns null when
   * the supplier is missing or not ACTIVE — a counter is only for live suppliers.
   */
  async ensureOutletForSupplier(
    supplierProfileId: number,
  ): Promise<Branch | null> {
    if (!supplierProfileId) return null;

    return this.dataSource.transaction(async (manager) => {
      // Serialise concurrent provisioning for this supplier (the Ebirr webhook
      // and the return-redirect can both complete an activation).
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        SUPPLIER_OUTLET_LOCK_NAMESPACE,
        supplierProfileId,
      ]);

      const profile = await manager.findOne(SupplierProfile, {
        where: { id: supplierProfileId },
      });
      if (!profile) return null;
      if (
        profile.activationStatus !== SupplierActivationStatus.ACTIVE ||
        !profile.isActive
      ) {
        return null;
      }

      let branch = await manager.findOne(Branch, {
        where: { supplierOutletProfileId: supplierProfileId },
      });

      if (!branch) {
        branch = await this.provisionOutletWorkspace(manager, profile);
      } else if (!branch.isActive) {
        // Re-activate an outlet that was suspended with the supplier.
        branch.isActive = true;
        branch = await manager.save(branch);
      }

      await this.ensureOwnerAssignment(manager, branch.id, profile.userId);
      await this.ensureOutletStorefront(manager, branch, profile);
      await this.syncOutletCatalogWithin(manager, profile.id, branch.id);

      return branch;
    });
  }

  /**
   * Backfill outlets for every already-ACTIVE supplier (suppliers that activated
   * before this feature shipped). Idempotent. Intended for a one-off SUPER_ADMIN
   * trigger after deploy; affected supplier owners must re-login afterwards so
   * their fresh token carries the derived POS_MANAGER role for the outlet.
   */
  async ensureOutletsForAllActiveSuppliers(): Promise<{
    processed: number;
    provisioned: number;
  }> {
    const profiles = await this.dataSource.getRepository(SupplierProfile).find({
      where: {
        activationStatus: SupplierActivationStatus.ACTIVE,
        isActive: true,
      },
      select: { id: true },
    });

    let provisioned = 0;
    for (const profile of profiles) {
      try {
        const branch = await this.ensureOutletForSupplier(profile.id);
        if (branch) provisioned += 1;
      } catch (err: any) {
        this.logger.warn(
          `Backfill outlet failed for supplier #${profile.id}: ${err?.message}`,
        );
      }
    }
    return { processed: profiles.length, provisioned };
  }

  /**
   * Re-mirror the supplier's published offers into its outlet catalog (e.g. after
   * the supplier adds products). No-op when the supplier has no outlet yet.
   */
  async syncOutletCatalog(supplierProfileId: number): Promise<void> {
    if (!supplierProfileId) return;
    const branch = await this.getOutletBranchForProfile(supplierProfileId);
    if (!branch) return;
    await this.dataSource.transaction((manager) =>
      this.syncOutletCatalogWithin(manager, supplierProfileId, branch.id),
    );
  }

  /**
   * The public-listing state of every product on a supplier's outlet shelf,
   * keyed by productId. Lets the supplier catalog render "listed / not listed"
   * and the consumer price without a second round trip per offer.
   */
  async getConsumerListings(
    supplierProfileId: number,
  ): Promise<
    Map<number, { consumerVisible: boolean; retailPrice: number | null }>
  > {
    const map = new Map<
      number,
      { consumerVisible: boolean; retailPrice: number | null }
    >();
    if (!supplierProfileId) return map;

    const branch = await this.getOutletBranchForProfile(supplierProfileId);
    if (!branch) return map;

    const links = await this.dataSource
      .getRepository(BranchCatalogProductLink)
      .find({ where: { branchId: branch.id } });

    for (const link of links) {
      map.set(link.productId, {
        consumerVisible: link.consumerVisible === true,
        retailPrice: link.retailPrice ?? null,
      });
    }
    return map;
  }

  /**
   * List (or unlist) one of the supplier's own products on the public
   * marketplace, at a consumer retail price that is theirs to set.
   *
   * A supplier posts one price to buyers — `unitWholesalePrice` — and
   * `createProductOffer` copies it onto the backing `Product.price`. The consumer
   * shelf prices at `COALESCE(retail_sale_price, retail_price, product.price)`,
   * so listing an offer without a retail price would publish the supplier's
   * wholesale price to shoppers. Refusing that here is the write half of the
   * guard; the read half lives in the consumer catalog query, because a link row
   * can also be reached through the Seller-HQ shelf tools.
   *
   * The outlet storefront is only revealed once something is actually listed —
   * an empty shop on the marketplace is worse than no shop.
   */
  async setOfferConsumerListing(
    supplierProfileId: number,
    productId: number,
    options: { consumerVisible: boolean; retailPrice?: number | null },
  ): Promise<{
    branchId: number;
    consumerVisible: boolean;
    retailPrice: number | null;
  }> {
    const retailPrice =
      options.retailPrice == null ? null : Number(options.retailPrice);

    if (options.consumerVisible) {
      if (
        retailPrice == null ||
        !Number.isFinite(retailPrice) ||
        retailPrice <= 0
      ) {
        throw new BadRequestException(
          'Set a consumer price before listing this product publicly. Your wholesale price is never shown to shoppers.',
        );
      }
    }

    const branch = await this.getOutletBranchForProfile(supplierProfileId);
    if (!branch) {
      throw new BadRequestException(
        'Your wholesale counter is not set up yet, so there is nothing to list from.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const link = await manager.findOne(BranchCatalogProductLink, {
        where: { branchId: branch.id, productId },
      });
      if (!link) {
        throw new BadRequestException(
          'That product is not on your counter catalog yet. Publish the offer first.',
        );
      }

      // Only move the price when the caller supplied one, so unlisting keeps the
      // price the supplier already set and re-listing does not ask for it again.
      if (options.retailPrice !== undefined) {
        link.retailPrice = retailPrice;
      }
      link.consumerVisible = options.consumerVisible;
      await manager.save(link);

      if (options.consumerVisible) {
        const profile = await manager.findOne(SupplierProfile, {
          where: { id: supplierProfileId },
        });
        if (profile) {
          await this.ensureOutletStorefront(manager, branch, profile, {
            consumerVisible: true,
          });
        }
      }

      return {
        branchId: branch.id,
        consumerVisible: link.consumerVisible,
        retailPrice: link.retailPrice ?? null,
      };
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Give the outlet branch the consumer storefront it needs to be reachable.
   *
   * `GET /consumer/v1/branches` filters on an EXISTS against `vendor_stores`, so
   * a branch without one is invisible to shoppers no matter what is on its
   * shelf. Created hidden: a supplier who has listed nothing should not appear as
   * an empty shop. `linkBranchToVendorStore` writes both halves of the
   * unenforced 1:1 so the link can never end up one-sided.
   */
  private async ensureOutletStorefront(
    manager: EntityManager,
    branch: Branch,
    profile: SupplierProfile,
    options: { consumerVisible?: boolean } = {},
  ): Promise<VendorStore> {
    const existing = await manager.findOne(VendorStore, {
      where: { branchId: branch.id },
    });

    if (existing) {
      let dirty = false;
      if (options.consumerVisible && !existing.isConsumerVisible) {
        existing.isConsumerVisible = true;
        dirty = true;
      }
      if (existing.serviceFormat !== branch.serviceFormat) {
        existing.serviceFormat = branch.serviceFormat ?? null;
        dirty = true;
      }
      if (dirty) await manager.save(existing);
      // Repair a half-written link rather than trusting branch.vendorStoreId.
      if (branch.vendorStoreId !== existing.id) {
        await linkBranchToVendorStore(manager, branch.id, existing.id);
      }
      return existing;
    }

    const store = await manager.save(
      manager.create(VendorStore, {
        ownerUserId: profile.userId,
        branchId: branch.id,
        storeName: profile.companyName?.trim() || branch.name,
        serviceFormat: branch.serviceFormat ?? null,
        isConsumerVisible: options.consumerVisible ?? false,
      }),
    );
    await linkBranchToVendorStore(manager, branch.id, store.id);
    this.logger.log(
      `Provisioned outlet storefront #${store.id} for supplier #${profile.id} (branch #${branch.id})`,
    );
    return store;
  }

  private async provisionOutletWorkspace(
    manager: EntityManager,
    profile: SupplierProfile,
  ): Promise<Branch> {
    const companyName =
      profile.companyName?.trim() || `Supplier #${profile.id}`;

    // 1. A dedicated retail tenant owned by the supplier user.
    const tenant = await manager.save(
      manager.create(RetailTenant, {
        name: `${companyName} — Wholesale Counter`,
        code: `SUPT-${profile.id}`,
        ownerUserId: profile.userId,
        defaultCurrency: 'ETB',
        status: RetailTenantStatus.ACTIVE,
      }),
    );

    // 2. POS_CORE (register) + INVENTORY_CORE (branch-products catalog) entitlements.
    for (const module of [RetailModule.POS_CORE, RetailModule.INVENTORY_CORE]) {
      await manager.save(
        manager.create(TenantModuleEntitlement, {
          tenantId: tenant.id,
          module,
          enabled: true,
          reason:
            'Supplier cash & carry counter (bundled with supplier activation)',
        }),
      );
    }

    // 3. The outlet branch (RETAIL format, owned by the supplier user, flagged).
    const branch = await manager.save(
      manager.create(Branch, {
        name: `${companyName} Counter`,
        code: `SUPC-${profile.id}`,
        serviceFormat: 'RETAIL',
        ownerId: profile.userId,
        retailTenantId: tenant.id,
        supplierOutletProfileId: profile.id,
        isActive: true,
      }),
    );

    // 4. A free, non-expiring ACTIVE subscription so the workspace resolves ACTIVE.
    const now = new Date();
    await manager.save(
      manager.create(TenantSubscription, {
        tenantId: tenant.id,
        branchId: branch.id,
        planCode: SUPPLIER_OUTLET_PLAN_CODE,
        status: TenantSubscriptionStatus.ACTIVE,
        billingInterval: TenantBillingInterval.MONTHLY,
        amount: 0,
        amountTotal: 0,
        currency: 'ETB',
        startsAt: now,
        endsAt: new Date(now.getTime() + TEN_YEARS_MS),
        autoRenew: false,
        metadata: {
          provisioningSource: 'SUPPLIER_OUTLET',
          supplierProfileId: profile.id,
          bundled: true,
        },
      }),
    );

    this.logger.log(
      `Provisioned supplier outlet branch #${branch.id} (tenant #${tenant.id}) for supplier #${profile.id}`,
    );
    return branch;
  }

  private async ensureOwnerAssignment(
    manager: EntityManager,
    branchId: number,
    ownerUserId: number,
  ): Promise<void> {
    const existing = await manager.findOne(BranchStaffAssignment, {
      where: { branchId, userId: ownerUserId },
    });
    if (existing) {
      // Keep an existing owner assignment manager-level + on the counter lane.
      let dirty = false;
      if (!existing.isActive) {
        existing.isActive = true;
        dirty = true;
      }
      if (existing.role !== BranchStaffRole.MANAGER) {
        existing.role = BranchStaffRole.MANAGER;
        dirty = true;
      }
      if (
        existing.posExperienceProfileCode !== WHOLESALE_COUNTER_PROFILE_CODE
      ) {
        existing.posExperienceProfileCode = WHOLESALE_COUNTER_PROFILE_CODE;
        dirty = true;
      }
      if (dirty) await manager.save(existing);
      return;
    }

    await manager.save(
      manager.create(BranchStaffAssignment, {
        branchId,
        userId: ownerUserId,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
        posExperienceProfileCode: WHOLESALE_COUNTER_PROFILE_CODE,
      }),
    );
  }

  /**
   * Mirror every PUBLISHED supplier offer into the outlet catalog: an explicit
   * branch_catalog_product_links row (so it appears in /retail branch-products)
   * and a seeded branch_inventory row (counter stock). Existing inventory is
   * never clobbered — re-sync only ADDS new products and links, so counted
   * counter stock survives subsequent syncs.
   *
   * New links are stamped `SUPPLIER_OFFER` and stay `consumerVisible = false`.
   * Being on the counter shelf and being listed to the public are separate
   * decisions, and the second one needs a consumer price the supplier has not
   * given yet — see `setOfferConsumerListing`.
   */
  private async syncOutletCatalogWithin(
    manager: EntityManager,
    supplierProfileId: number,
    branchId: number,
  ): Promise<void> {
    const offers = await manager.find(SupplierOffer, {
      where: {
        supplierProfileId,
        status: SupplierOfferStatus.PUBLISHED,
      },
      relations: { product: true },
    });
    if (!offers.length) return;

    for (const offer of offers) {
      const productId = offer.productId;
      if (!productId) continue;

      const existingLink = await manager.findOne(BranchCatalogProductLink, {
        where: { branchId, productId },
      });
      if (!existingLink) {
        await manager.save(
          manager.create(BranchCatalogProductLink, {
            branchId,
            productId,
            source: 'SUPPLIER_OFFER',
            sourceSupplierProfileId: supplierProfileId,
          }),
        );
      }

      const existingInventory = await manager.findOne(BranchInventory, {
        where: { branchId, productId },
      });
      if (!existingInventory) {
        const seed = Math.max(
          0,
          Math.trunc(Number(offer.product?.stockQuantity ?? 0)) || 0,
        );
        await manager.save(
          manager.create(BranchInventory, {
            branchId,
            productId,
            quantityOnHand: seed,
            availableToSell: seed,
          }),
        );
      }
    }
  }
}
