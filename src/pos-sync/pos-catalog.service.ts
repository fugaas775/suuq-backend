import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { Branch } from '../branches/entities/branch.entity';
import { ProductAlias } from '../product-aliases/entities/product-alias.entity';
import { Product } from '../products/entities/product.entity';
import { absolutize } from '../common/utils/media-url.util';
import { PosCatalogSearchQueryDto } from './dto/pos-catalog-search-query.dto';
import {
  PosCatalogSearchItemResponseDto,
  PosCatalogSearchResponseDto,
} from './dto/pos-catalog-search-response.dto';

@Injectable()
export class PosCatalogService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductAlias)
    private readonly productAliasesRepository: Repository<ProductAlias>,
    @InjectRepository(BranchInventory)
    private readonly branchInventoryRepository: Repository<BranchInventory>,
  ) {}

  async search(
    query: PosCatalogSearchQueryDto,
  ): Promise<PosCatalogSearchResponseDto> {
    const normalizedQuery = String(query.query || '').trim();
    if (!normalizedQuery) {
      throw new BadRequestException(
        'Catalog search requires a non-empty query',
      );
    }

    const branch = await this.branchesRepository.findOne({
      where: { id: query.branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${query.branchId} not found`);
    }
    if (branch.retailTenantId == null) {
      throw new BadRequestException(
        `Branch ${query.branchId} is not assigned to a Retail OS tenant`,
      );
    }

    const limit = Math.min(Math.max(query.limit ?? 12, 1), 25);
    const search = normalizedQuery.toLowerCase();
    const exact = search.replace(/\s+/g, '');

    const rows = await this.productsRepository
      .createQueryBuilder('product')
      .leftJoin(
        ProductAlias,
        'alias',
        'alias.productId = product.id AND alias.tenantId = :tenantId AND alias.isActive = true AND alias.partnerCredentialId IS NULL AND (alias.branchId IS NULL OR alias.branchId = :branchId)',
        {
          tenantId: branch.retailTenantId,
          branchId: query.branchId,
        },
      )
      .leftJoin(
        BranchInventory,
        'inventory',
        'inventory.productId = product.id AND inventory.branchId = :branchId',
        {
          branchId: query.branchId,
        },
      )
      .where("COALESCE(product.status, 'publish') = 'publish'")
      .andWhere(
        "(LOWER(product.name) LIKE :search OR LOWER(COALESCE(product.sku, '')) LIKE :search OR LOWER(COALESCE(alias.aliasValue, '')) LIKE :search OR LOWER(COALESCE(alias.normalizedAliasValue, '')) LIKE :search)",
        { search: `%${search}%` },
      )
      .select([
        'product.id AS product_id',
        'product.name AS product_name',
        'product.sku AS product_sku',
        'product.imageUrl AS product_image_url',
        'product.currency AS product_currency',
        'product.price AS product_price',
        'product.sale_price AS product_sale_price',
        'alias.aliasType AS alias_type',
        'alias.aliasValue AS alias_value',
        'inventory.availableToSell AS inventory_available_to_sell',
        'inventory.safetyStock AS inventory_safety_stock',
      ])
      .orderBy(
        `CASE
        WHEN LOWER(COALESCE(alias.aliasValue, '')) = :exact THEN 0
        WHEN LOWER(COALESCE(product.sku, '')) = :exact THEN 1
        WHEN LOWER(product.name) = :search THEN 2
        ELSE 3
      END`,
        'ASC',
      )
      .addOrderBy('inventory.availableToSell', 'DESC', 'NULLS LAST')
      .addOrderBy('product.id', 'DESC')
      .setParameters({ exact, search })
      .take(limit * 4)
      .getRawMany();

    const seen = new Map<number, PosCatalogSearchItemResponseDto>();
    for (const row of rows) {
      const productId = Number(row.product_id);
      if (!Number.isFinite(productId) || productId <= 0) {
        continue;
      }

      if (!seen.has(productId)) {
        const availableToSell = Number(row.inventory_available_to_sell ?? 0);
        const safetyStock = Number(row.inventory_safety_stock ?? 0);
        let stockStatus:
          | 'HEALTHY'
          | 'LOW_STOCK'
          | 'REORDER_NOW'
          | 'OUT_OF_STOCK' = 'HEALTHY';

        if (availableToSell <= 0) {
          stockStatus = 'OUT_OF_STOCK';
        } else if (availableToSell <= safetyStock) {
          stockStatus = 'REORDER_NOW';
        } else if (availableToSell <= Math.max(safetyStock * 2, 1)) {
          stockStatus = 'LOW_STOCK';
        }

        seen.set(productId, {
          productId,
          name: row.product_name,
          sku: row.product_sku ?? null,
          imageUrl: absolutize(row.product_image_url ?? null) ?? null,
          currency: row.product_currency || 'ETB',
          unitPrice: Number(row.product_sale_price ?? row.product_price ?? 0),
          availableToSell,
          stockStatus,
          matchedAliasType: row.alias_type ?? null,
          matchedAliasValue: row.alias_value ?? null,
        });
      }

      if (seen.size >= limit) {
        break;
      }
    }

    return {
      items: Array.from(seen.values()),
    };
  }
}
