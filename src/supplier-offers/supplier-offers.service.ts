import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import {
  SupplierActivationStatus,
  SupplierProfile,
} from '../suppliers/entities/supplier-profile.entity';
import {
  SupplierAvailabilityStatus,
  SupplierOffer,
  SupplierOfferStatus,
} from './entities/supplier-offer.entity';
import { CreateSupplierOfferDto } from './dto/create-supplier-offer.dto';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { BulkCreateSupplierProductsDto } from './dto/bulk-create-supplier-products.dto';
import { UpdateSupplierOfferDto } from './dto/update-supplier-offer.dto';
import {
  actorIsSuperAdmin,
  listOwnedSupplierProfileIds,
  resolveActiveOwnedProfile,
} from '../suppliers/active-supplier.util';
import { SupplierOutletService } from '../suppliers/supplier-outlet.service';

/**
 * Supplier-facing catalog management. Every operation is scoped to the supplier
 * profile owned by the acting user (resolved from userId), so a supplier can
 * only ever read/mutate their own offers. The buyer-facing browse remains in
 * PurchaseOrdersService.findAvailableOffers, which is the single source of truth
 * for which offers surface to buyers (PUBLISHED + ACTIVE supplier) — publish
 * here just flips status to PUBLISHED once the supplier subscription is ACTIVE.
 */
@Injectable()
export class SupplierOffersService {
  constructor(
    @InjectRepository(SupplierOffer)
    private readonly offersRepository: Repository<SupplierOffer>,
    @InjectRepository(SupplierProfile)
    private readonly profilesRepository: Repository<SupplierProfile>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly supplierOutletService: SupplierOutletService,
  ) {}

  /**
   * Best-effort re-mirror of the supplier's published catalog into its Suuq POS
   * counter outlet (no-op when the supplier has no outlet). Fire-and-forget so a
   * catalog-sync hiccup never fails the product create/publish itself.
   */
  private resyncOutletCatalog(supplierProfileId: number): void {
    void this.supplierOutletService
      .syncOutletCatalog(supplierProfileId)
      .catch(() => undefined);
  }

  async listForUser(
    userId: number | null | undefined,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierOffer[]> {
    const profile = await this.resolveProfileOrThrow(
      userId,
      activeSupplierId,
      actingRoles,
    );
    return this.offersRepository.find({
      where: { supplierProfileId: profile.id },
      order: { createdAt: 'DESC' },
      relations: { product: true },
    });
  }

  async createForUser(
    userId: number | null | undefined,
    dto: CreateSupplierOfferDto,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierOffer> {
    const profile = await this.resolveProfileOrThrow(
      userId,
      activeSupplierId,
      actingRoles,
    );
    const product = await this.productsRepository.findOne({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} not found`);
    }
    const offer = this.offersRepository.create({
      supplierProfileId: profile.id,
      productId: dto.productId,
      status: SupplierOfferStatus.DRAFT,
      availabilityStatus:
        dto.availabilityStatus ?? SupplierAvailabilityStatus.IN_STOCK,
      currency: dto.currency ?? 'USD',
      unitWholesalePrice: dto.unitWholesalePrice,
      moq: dto.moq ?? 1,
      leadTimeDays: dto.leadTimeDays ?? 0,
      fulfillmentRegions: dto.fulfillmentRegions ?? [],
    });
    return this.offersRepository.save(offer);
  }

  /**
   * Create a B2B-only product plus its wholesale offer in one step — the
   * supplier-portal equivalent of a branch adding a product. The product is
   * owned by the supplier's user, stored with status 'draft' and no consumer
   * VendorStore scope so it never surfaces in the consumer marketplace; it only
   * exists to back the offer that buyers see in the supplier catalog.
   */
  async createProductWithOfferForUser(
    userId: number | null | undefined,
    dto: CreateSupplierProductDto,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierOffer> {
    const profile = await this.resolveProfileOrThrow(
      userId,
      activeSupplierId,
      actingRoles,
    );
    const offer = await this.createProductOffer(profile, dto);
    this.resyncOutletCatalog(profile.id);
    return offer;
  }

  /**
   * Bulk-create products + offers with row-level results — the supplier mirror
   * of the branch bulk product importer. Each row is created in its own
   * transaction so one bad row never aborts the batch.
   */
  async bulkCreateProductsWithOffersForUser(
    userId: number | null | undefined,
    dto: BulkCreateSupplierProductsDto,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<{
    total: number;
    created: number;
    failed: number;
    results: Array<{
      index: number;
      ok: boolean;
      name: string | null;
      offerId?: number;
      productId?: number;
      error?: string;
    }>;
  }> {
    const profile = await this.resolveProfileOrThrow(
      userId,
      activeSupplierId,
      actingRoles,
    );
    const items = dto.items ?? [];
    const results: Array<{
      index: number;
      ok: boolean;
      name: string | null;
      offerId?: number;
      productId?: number;
      error?: string;
    }> = [];
    let created = 0;
    let failed = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      try {
        const offer = await this.createProductOffer(profile, item);
        created += 1;
        results.push({
          index,
          ok: true,
          name: item?.name ?? null,
          offerId: offer.id,
          productId: offer.productId,
        });
      } catch (err) {
        failed += 1;
        results.push({
          index,
          ok: false,
          name: item?.name ?? null,
          error:
            err instanceof Error ? err.message : 'Failed to create product',
        });
      }
    }
    if (created > 0) {
      this.resyncOutletCatalog(profile.id);
    }
    return { total: items.length, created, failed, results };
  }

  async updateForUser(
    userId: number | null | undefined,
    id: number,
    dto: UpdateSupplierOfferDto,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierOffer> {
    const offer = await this.findOwnedOfferOrThrow(
      userId,
      id,
      activeSupplierId,
      actingRoles,
    );
    if (offer.status === SupplierOfferStatus.ARCHIVED) {
      throw new BadRequestException('Archived offers cannot be edited');
    }
    if (dto.availabilityStatus !== undefined)
      offer.availabilityStatus = dto.availabilityStatus;
    if (dto.currency !== undefined) offer.currency = dto.currency;
    if (dto.unitWholesalePrice !== undefined)
      offer.unitWholesalePrice = dto.unitWholesalePrice;
    if (dto.moq !== undefined) offer.moq = dto.moq;
    if (dto.leadTimeDays !== undefined) offer.leadTimeDays = dto.leadTimeDays;
    if (dto.fulfillmentRegions !== undefined)
      offer.fulfillmentRegions = dto.fulfillmentRegions;
    return this.offersRepository.save(offer);
  }

  async publishForUser(
    userId: number | null | undefined,
    id: number,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierOffer> {
    const offer = await this.findOwnedOfferOrThrow(
      userId,
      id,
      activeSupplierId,
      actingRoles,
    );
    const profile = await this.profilesRepository.findOne({
      where: { id: offer.supplierProfileId },
    });
    if (profile?.activationStatus !== SupplierActivationStatus.ACTIVE) {
      throw new BadRequestException(
        'Activate your supplier subscription before publishing offers',
      );
    }
    if (!profile.isActive) {
      throw new BadRequestException('Inactive suppliers cannot publish offers');
    }
    offer.status = SupplierOfferStatus.PUBLISHED;
    const saved = await this.offersRepository.save(offer);
    // A newly published offer should appear at the supplier's counter.
    this.resyncOutletCatalog(offer.supplierProfileId);
    return saved;
  }

  async archiveForUser(
    userId: number | null | undefined,
    id: number,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierOffer> {
    const offer = await this.findOwnedOfferOrThrow(
      userId,
      id,
      activeSupplierId,
      actingRoles,
    );
    offer.status = SupplierOfferStatus.ARCHIVED;
    return this.offersRepository.save(offer);
  }

  // ---- Helpers -------------------------------------------------------------

  /**
   * Create one B2B-only product + offer atomically for an already-resolved
   * supplier profile. Shared by the single and bulk create paths.
   */
  private async createProductOffer(
    profile: SupplierProfile,
    dto: CreateSupplierProductDto,
  ): Promise<SupplierOffer> {
    const name = String(dto.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('Product name is required');
    }
    if (
      dto.unitWholesalePrice == null ||
      Number.isNaN(Number(dto.unitWholesalePrice))
    ) {
      throw new BadRequestException('Wholesale price is required');
    }
    const currency = (dto.currency ?? 'USD').toUpperCase();
    const moq = dto.moq ?? 1;
    // Only publish straight away when the supplier subscription is live; the
    // gate mirrors publishForUser so the two paths can't diverge.
    const canPublish =
      profile.activationStatus === SupplierActivationStatus.ACTIVE &&
      profile.isActive;
    const shouldPublish = dto.publish !== false && canPublish;

    return this.offersRepository.manager.transaction(async (em) => {
      const product = em.create(Product, {
        name,
        description: dto.description?.trim() || name,
        price: Number(dto.unitWholesalePrice),
        currency,
        barcode: dto.barcode?.trim() || null,
        productType: dto.productType ?? 'physical',
        stockQuantity:
          typeof dto.stockQuantity === 'number' ? dto.stockQuantity : undefined,
        manageStock: typeof dto.stockQuantity === 'number',
        moq,
        // B2B-only: 'draft' keeps it out of the consumer catalog, and we never
        // attach a consumer VendorStore, so it only ever backs the offer.
        status: 'draft',
        vendor: { id: profile.userId } as any,
      });
      const savedProduct = await em.save(product);

      const offer = em.create(SupplierOffer, {
        supplierProfileId: profile.id,
        productId: savedProduct.id,
        status: shouldPublish
          ? SupplierOfferStatus.PUBLISHED
          : SupplierOfferStatus.DRAFT,
        availabilityStatus:
          dto.availabilityStatus ?? SupplierAvailabilityStatus.IN_STOCK,
        currency,
        unitWholesalePrice: Number(dto.unitWholesalePrice),
        moq,
        leadTimeDays: dto.leadTimeDays ?? 0,
        fulfillmentRegions: dto.fulfillmentRegions ?? [],
      });
      const savedOffer = await em.save(offer);
      (savedOffer as any).product = savedProduct;
      return savedOffer;
    });
  }

  private async resolveProfileOrThrow(
    userId: number | null | undefined,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierProfile> {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }
    const profile = await resolveActiveOwnedProfile(
      this.profilesRepository,
      userId,
      activeSupplierId,
      actingRoles,
    );
    if (!profile) {
      throw new ForbiddenException(
        'You must create a supplier profile before managing offers',
      );
    }
    return profile;
  }

  private async findOwnedOfferOrThrow(
    userId: number | null | undefined,
    id: number,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierOffer> {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }
    const offer = await this.offersRepository.findOne({ where: { id } });
    if (!offer) {
      throw new NotFoundException(`Supplier offer ${id} not found`);
    }
    // SUPER_ADMIN acting as a supplier owner manages that supplier's offers.
    // Scope to the explicitly-acted supplier (x-supplier-id) when provided.
    if (actorIsSuperAdmin(actingRoles)) {
      if (
        activeSupplierId &&
        offer.supplierProfileId !== Number(activeSupplierId)
      ) {
        throw new ForbiddenException(
          'This offer belongs to a different supplier',
        );
      }
      return offer;
    }
    // Multi-supplier: the offer may belong to any of the user's supplier
    // profiles (not just the currently-active one), so check membership against
    // all owned profiles rather than a single resolved profile.
    const ownedProfileIds = await listOwnedSupplierProfileIds(
      this.profilesRepository,
      userId,
    );
    if (!ownedProfileIds.includes(offer.supplierProfileId)) {
      throw new ForbiddenException('You can only manage your own offers');
    }
    return offer;
  }
}
