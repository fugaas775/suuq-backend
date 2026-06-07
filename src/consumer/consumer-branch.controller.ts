import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Product } from '../products/entities/product.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import {
  ConsumerBranchItemDto,
  ConsumerBranchListDto,
  ConsumerBranchProductItemDto,
  ConsumerBranchProductsDto,
  ConsumerBranchQrDto,
} from './dto/consumer-response.dto';
import { ConsumerBranchQueryDto } from './dto/consumer-branch-query.dto';
import { SERVICE_FORMAT_LABELS } from './dto/place-consumer-order.dto';

function toFormatLabel(code: string | null | undefined): string {
  if (!code) return 'Business';
  return (SERVICE_FORMAT_LABELS as Record<string, string>)[code] ?? code;
}

/** Public base URL used to build branch QR universal links. */
function publicBaseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL || 'https://suuq-s.com';
  return raw.replace(/\/+$/, '');
}

function toBranchItem(branch: Branch): ConsumerBranchItemDto {
  const owner = branch.owner ?? null;
  return {
    branchId: branch.id,
    name: branch.name,
    serviceFormat: branch.serviceFormat ?? null,
    serviceFormatLabel: toFormatLabel(branch.serviceFormat),
    address: branch.address ?? null,
    city: branch.city ?? null,
    phone: branch.phone ?? null,
    latitude: branch.latitude != null ? Number(branch.latitude) : null,
    longitude: branch.longitude != null ? Number(branch.longitude) : null,
    isActive: branch.isActive,
    ownerId: owner?.id ?? branch.ownerId ?? null,
    ownerName: owner ? (owner.storeName ?? owner.displayName ?? null) : null,
    logoUrl: owner?.avatarUrl ?? null,
  };
}

@Controller('consumer/v1/branches')
export class ConsumerBranchController {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(VendorStore)
    private readonly vendorStoreRepo: Repository<VendorStore>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(BranchCatalogProductLink)
    private readonly catalogLinkRepo: Repository<BranchCatalogProductLink>,
  ) {}

  /**
   * GET /consumer/v1/branches
   * Discover active branches, optionally filtered by service format or text.
   */
  @Get()
  async listBranches(
    @Query() query: ConsumerBranchQueryDto,
  ): Promise<ConsumerBranchListDto> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.branchesRepository
      .createQueryBuilder('branch')
      .leftJoinAndSelect('branch.owner', 'owner')
      .where('branch.isActive = true')
      // Only show branches that have a consumer-visible store profile
      .andWhere(
        `EXISTS (
          SELECT 1 FROM vendor_stores vs
          WHERE vs."branchId" = branch.id
          AND vs."isConsumerVisible" = true
        )`,
      );

    if (query.serviceFormat?.length) {
      qb.andWhere('branch.serviceFormat IN (:...formats)', {
        formats: query.serviceFormat,
      });
    }

    if (query.q) {
      qb.andWhere(
        '(LOWER(branch.name) LIKE :search OR LOWER(branch.city) LIKE :search OR LOWER(branch.address) LIKE :search)',
        { search: `%${query.q.toLowerCase()}%` },
      );
    }

    if (query.lat != null && query.lng != null && query.radius != null) {
      // Haversine proximity filter (radius in km)
      qb.andWhere(
        `(
          6371 * ACOS(
            COS(RADIANS(:lat)) * COS(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
            * COS(RADIANS(CAST(branch.longitude AS DOUBLE PRECISION)) - RADIANS(:lng))
            + SIN(RADIANS(:lat)) * SIN(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
          )
        ) <= :radius`,
        { lat: query.lat, lng: query.lng, radius: query.radius },
      );
    }

    // Sort by proximity when coordinates are supplied, otherwise alphabetically.
    // GREATEST/LEAST guards against floating-point ACOS domain errors on edge rows.
    if (query.lat != null && query.lng != null) {
      qb.setParameter('latSort', query.lat);
      qb.setParameter('lngSort', query.lng);
      qb.orderBy(
        `(6371 * ACOS(GREATEST(-1, LEAST(1,
          COS(RADIANS(:latSort)) * COS(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
          * COS(RADIANS(CAST(branch.longitude AS DOUBLE PRECISION)) - RADIANS(:lngSort))
          + SIN(RADIANS(:latSort)) * SIN(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
        ))))`,
        'ASC',
      );
    } else {
      qb.orderBy('branch.name', 'ASC');
    }
    qb.skip(skip).take(limit);

    const [branches, total] = await qb.getManyAndCount();

    return {
      items: branches.map(toBranchItem),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * GET /consumer/v1/branches/:branchId
   * Returns the public profile of a single branch.
   */
  @Get(':branchId')
  async getBranch(
    @Param('branchId', ParseIntPipe) branchId: number,
  ): Promise<ConsumerBranchItemDto> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, isActive: true },
      relations: { owner: true },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }
    return toBranchItem(branch);
  }

  /**
   * GET /consumer/v1/branches/:branchId/qr
   * Returns the universal link a branch should encode in its printed QR code.
   * Scanning it deep-links into the consumer app's branch ordering screen.
   */
  @Get(':branchId/qr')
  async getBranchQr(
    @Param('branchId', ParseIntPipe) branchId: number,
  ): Promise<ConsumerBranchQrDto> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }
    return {
      branchId: branch.id,
      name: branch.name,
      url: `${publicBaseUrl()}/s/b/${branch.id}`,
    };
  }

  /**
   * GET /consumer/v1/branches/:branchId/products
   * Returns published products for a branch's consumer-visible catalog.
   * Returns an empty list (not 404) when the branch has no catalog configured.
   */
  @Get(':branchId/products')
  async getBranchProducts(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('page') rawPage?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<ConsumerBranchProductsDto> {
    const page = Math.max(parseInt(rawPage ?? '1', 10) || 1, 1);
    const limit = Math.min(parseInt(rawLimit ?? '50', 10) || 50, 100);
    const skip = (page - 1) * limit;

    // Primary source: branch_catalog_product_links (the POS Seller Hub catalog).
    // These are products explicitly linked to the branch by the merchant.
    const linkedCount = await this.catalogLinkRepo.count({
      where: { branchId },
    });

    if (linkedCount > 0) {
      // Build query via the catalog links table so we include all linked products
      // regardless of their vendor_store_id assignment.
      const baseQb = this.productRepo
        .createQueryBuilder('p')
        .innerJoin(
          'branch_catalog_product_links',
          'bcl',
          'bcl."productId" = p.id AND bcl."branchId" = :branchId',
          { branchId },
        )
        .where("p.status = 'publish'")
        .andWhere('p.deleted_at IS NULL');

      const total = await baseQb.clone().getCount();

      const products = await baseQb
        .leftJoinAndSelect('p.tags', 'tag')
        .orderBy('p.name', 'ASC')
        .skip(skip)
        .take(limit)
        .getMany();

      const items: ConsumerBranchProductItemDto[] = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        currency: p.currency ?? null,
        imageUrl: p.imageUrl ?? null,
        productType: p.productType ?? null,
        tags: (p.tags ?? [])
          .map((t) => (t?.name ?? '').toLowerCase())
          .filter((name) => name.length > 0),
      }));

      return { items, total, page, limit };
    }

    // Fallback: vendor_store products linked directly by vendor_store_id
    // (legacy path for branches that haven't set up a POS catalog yet).
    const store = await this.vendorStoreRepo.findOne({
      where: { branchId, isConsumerVisible: true },
    });
    if (!store) {
      return { items: [], total: 0, page, limit };
    }

    const baseQb = this.productRepo
      .createQueryBuilder('p')
      .where('p.vendorStoreId = :sid', { sid: store.id })
      .andWhere("p.status = 'publish'")
      .andWhere('p.deletedAt IS NULL');

    const total = await baseQb.clone().getCount();

    const products = await baseQb
      .leftJoinAndSelect('p.tags', 'tag')
      .orderBy('p.name', 'ASC')
      .skip(skip)
      .take(limit)
      .getMany();

    const items: ConsumerBranchProductItemDto[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      currency: p.currency ?? null,
      imageUrl: p.imageUrl ?? null,
      productType: p.productType ?? null,
      tags: (p.tags ?? [])
        .map((t) => (t?.name ?? '').toLowerCase())
        .filter((name) => name.length > 0),
    }));

    return { items, total, page, limit };
  }
}
