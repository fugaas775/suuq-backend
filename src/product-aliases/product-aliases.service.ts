import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { Product } from '../products/entities/product.entity';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import { CreateProductAliasDto } from './dto/create-product-alias.dto';
import {
  ImportProductAliasesDto,
  ImportProductAliasesResponseDto,
  ProductAliasImportRowDto,
} from './dto/import-product-aliases.dto';
import { ListProductAliasesQueryDto } from './dto/list-product-aliases-query.dto';
import {
  ProductAlias,
  ProductAliasType,
} from './entities/product-alias.entity';

@Injectable()
export class ProductAliasesService {
  constructor(
    @InjectRepository(ProductAlias)
    private readonly productAliasesRepository: Repository<ProductAlias>,
    @InjectRepository(RetailTenant)
    private readonly retailTenantsRepository: Repository<RetailTenant>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(PartnerCredential)
    private readonly partnerCredentialsRepository: Repository<PartnerCredential>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductAliasDto): Promise<ProductAlias> {
    const prepared = await this.prepareAliasPayload(dto);

    await this.assertAliasScopeIsAvailable(
      prepared.tenantId,
      prepared.branchId,
      prepared.partnerCredentialId,
      prepared.aliasType,
      prepared.normalizedAliasValue,
    );

    const alias = this.productAliasesRepository.create(prepared);

    return this.productAliasesRepository.save(alias);
  }

  async importAliases(
    dto: ImportProductAliasesDto,
  ): Promise<ImportProductAliasesResponseDto> {
    const createdAliasIds: number[] = [];
    const failures: Array<{
      rowIndex: number;
      row: ProductAliasImportRowDto;
      error: string;
    }> = [];
    const seenScopeKeys = new Set<string>();

    for (const [rowIndex, row] of dto.rows.entries()) {
      try {
        const prepared = await this.prepareAliasPayload({
          tenantId: dto.tenantId,
          branchId: row.branchId,
          partnerCredentialId: row.partnerCredentialId,
          productId: row.productId,
          aliasType: row.aliasType,
          aliasValue: row.aliasValue,
          isActive: row.isActive,
          metadata: row.metadata,
        });

        const scopeKey = this.buildScopeKey(
          prepared.tenantId,
          prepared.branchId,
          prepared.partnerCredentialId,
          prepared.aliasType,
          prepared.normalizedAliasValue,
        );

        if (seenScopeKeys.has(scopeKey)) {
          throw new BadRequestException(
            `Alias ${prepared.aliasType}:${prepared.aliasValue} is duplicated within this import batch`,
          );
        }

        await this.assertAliasScopeIsAvailable(
          prepared.tenantId,
          prepared.branchId,
          prepared.partnerCredentialId,
          prepared.aliasType,
          prepared.normalizedAliasValue,
        );

        const alias = await this.productAliasesRepository.save(
          this.productAliasesRepository.create(prepared),
        );

        seenScopeKeys.add(scopeKey);
        createdAliasIds.push(alias.id);
      } catch (error) {
        failures.push({
          rowIndex,
          row,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown alias import error',
        });

        if (dto.continueOnError === false) {
          break;
        }
      }
    }

    return {
      tenantId: dto.tenantId,
      totalRows: dto.rows.length,
      createdCount: createdAliasIds.length,
      failedCount: failures.length,
      createdAliasIds,
      failures,
    };
  }

  private async prepareAliasPayload(dto: CreateProductAliasDto): Promise<{
    tenantId: number;
    branchId: number | null;
    partnerCredentialId: number | null;
    productId: number;
    aliasType: ProductAliasType;
    aliasValue: string;
    normalizedAliasValue: string;
    isActive: boolean;
    metadata: Record<string, any> | null;
  }> {
    const tenant = await this.retailTenantsRepository.findOne({
      where: { id: dto.tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(
        `Retail tenant with ID ${dto.tenantId} not found`,
      );
    }

    const product = await this.productsRepository.findOne({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }

    let resolvedBranchId = dto.branchId ?? null;
    if (resolvedBranchId != null) {
      const branch = await this.branchesRepository.findOne({
        where: { id: resolvedBranchId },
      });
      if (!branch) {
        throw new NotFoundException(
          `Branch with ID ${resolvedBranchId} not found`,
        );
      }
      if (branch.retailTenantId !== dto.tenantId) {
        throw new BadRequestException(
          `Branch ${resolvedBranchId} does not belong to retail tenant ${dto.tenantId}`,
        );
      }
    }

    if (dto.partnerCredentialId != null) {
      const partnerCredential = await this.partnerCredentialsRepository.findOne(
        {
          where: { id: dto.partnerCredentialId },
        },
      );
      if (!partnerCredential) {
        throw new NotFoundException(
          `Partner credential with ID ${dto.partnerCredentialId} not found`,
        );
      }

      if (partnerCredential.branchId == null) {
        throw new BadRequestException(
          `Partner credential ${dto.partnerCredentialId} is not bound to a branch`,
        );
      }

      if (
        resolvedBranchId != null &&
        resolvedBranchId !== partnerCredential.branchId
      ) {
        throw new BadRequestException(
          `Partner credential ${dto.partnerCredentialId} is not bound to branch ${resolvedBranchId}`,
        );
      }

      const credentialBranch = await this.branchesRepository.findOne({
        where: { id: partnerCredential.branchId },
      });
      if (!credentialBranch) {
        throw new NotFoundException(
          `Branch with ID ${partnerCredential.branchId} not found for partner credential ${dto.partnerCredentialId}`,
        );
      }
      if (credentialBranch.retailTenantId !== dto.tenantId) {
        throw new BadRequestException(
          `Partner credential ${dto.partnerCredentialId} does not belong to retail tenant ${dto.tenantId}`,
        );
      }

      resolvedBranchId = partnerCredential.branchId;
    }

    const aliasValue = dto.aliasValue.trim();
    if (!aliasValue) {
      throw new BadRequestException('aliasValue cannot be empty');
    }

    const normalizedAliasValue = this.normalizeAliasValue(aliasValue);

    return {
      tenantId: dto.tenantId,
      branchId: resolvedBranchId,
      partnerCredentialId: dto.partnerCredentialId ?? null,
      productId: dto.productId,
      aliasType: dto.aliasType,
      aliasValue,
      normalizedAliasValue,
      isActive: dto.isActive ?? true,
      metadata: dto.metadata ?? null,
    };
  }

  async findAll(query: ListProductAliasesQueryDto): Promise<ProductAlias[]> {
    const qb = this.productAliasesRepository
      .createQueryBuilder('alias')
      .leftJoinAndSelect('alias.product', 'product')
      .leftJoinAndSelect('alias.branch', 'branch')
      .leftJoinAndSelect('alias.partnerCredential', 'partnerCredential')
      .where('alias.tenantId = :tenantId', { tenantId: query.tenantId })
      .orderBy('alias.aliasType', 'ASC')
      .addOrderBy('alias.aliasValue', 'ASC')
      .addOrderBy('alias.id', 'ASC');

    if (query.branchId != null) {
      qb.andWhere('alias.branchId = :branchId', { branchId: query.branchId });
    }

    if (query.partnerCredentialId != null) {
      qb.andWhere('alias.partnerCredentialId = :partnerCredentialId', {
        partnerCredentialId: query.partnerCredentialId,
      });
    }

    if (query.productId != null) {
      qb.andWhere('alias.productId = :productId', {
        productId: query.productId,
      });
    }

    if (query.aliasType) {
      qb.andWhere('alias.aliasType = :aliasType', {
        aliasType: query.aliasType,
      });
    }

    const normalizedSearch = query.search?.trim().toLowerCase();
    if (normalizedSearch) {
      qb.andWhere(
        '(LOWER(alias.aliasValue) LIKE :search OR LOWER(alias.normalizedAliasValue) LIKE :search)',
        { search: `%${normalizedSearch}%` },
      );
    }

    return qb.getMany();
  }

  async resolveProductIdForBranch(
    branchId: number,
    partnerCredentialId: number | null | undefined,
    aliasType: ProductAliasType,
    aliasValue: string,
  ): Promise<number | null> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }

    if (branch.retailTenantId == null) {
      throw new BadRequestException(
        `Branch ${branchId} is not assigned to a Retail OS tenant`,
      );
    }

    const normalizedAliasValue = this.normalizeAliasValue(aliasValue);
    const aliases = await this.productAliasesRepository.find({
      where: {
        tenantId: branch.retailTenantId,
        aliasType,
        normalizedAliasValue,
        isActive: true,
      },
      order: { id: 'ASC' },
    });

    const partnerMatches =
      partnerCredentialId != null
        ? aliases.filter(
            (alias) => alias.partnerCredentialId === partnerCredentialId,
          )
        : [];
    if (partnerMatches.length > 1) {
      throw new BadRequestException(
        `Alias ${aliasType}:${aliasValue} is ambiguous for partner credential ${partnerCredentialId}`,
      );
    }
    if (partnerMatches.length === 1) {
      return partnerMatches[0].productId;
    }

    const branchMatches = aliases.filter(
      (alias) =>
        alias.partnerCredentialId == null && alias.branchId === branchId,
    );
    if (branchMatches.length > 1) {
      throw new BadRequestException(
        `Alias ${aliasType}:${aliasValue} is ambiguous for branch ${branchId}`,
      );
    }
    if (branchMatches.length === 1) {
      return branchMatches[0].productId;
    }

    const tenantMatches = aliases.filter(
      (alias) => alias.partnerCredentialId == null && alias.branchId == null,
    );
    if (tenantMatches.length > 1) {
      throw new BadRequestException(
        `Alias ${aliasType}:${aliasValue} is ambiguous for retail tenant ${branch.retailTenantId}`,
      );
    }
    if (tenantMatches.length === 1) {
      return tenantMatches[0].productId;
    }

    return null;
  }

  private async assertAliasScopeIsAvailable(
    tenantId: number,
    branchId: number | null,
    partnerCredentialId: number | null,
    aliasType: ProductAliasType,
    normalizedAliasValue: string,
  ): Promise<void> {
    const existing = await this.productAliasesRepository.findOne({
      where:
        partnerCredentialId != null
          ? {
              partnerCredentialId,
              aliasType,
              normalizedAliasValue,
            }
          : branchId != null
            ? {
                tenantId,
                branchId,
                partnerCredentialId: IsNull(),
                aliasType,
                normalizedAliasValue,
              }
            : {
                tenantId,
                branchId: IsNull(),
                partnerCredentialId: IsNull(),
                aliasType,
                normalizedAliasValue,
              },
    });

    if (existing) {
      throw new BadRequestException(
        `Alias ${aliasType}:${existing.aliasValue} already exists for the requested scope`,
      );
    }
  }

  private normalizeAliasValue(value: string): string {
    return value.trim().toLowerCase();
  }

  private buildScopeKey(
    tenantId: number,
    branchId: number | null,
    partnerCredentialId: number | null,
    aliasType: ProductAliasType,
    normalizedAliasValue: string,
  ): string {
    return [
      tenantId,
      branchId ?? 'tenant',
      partnerCredentialId ?? 'direct',
      aliasType,
      normalizedAliasValue,
    ].join('::');
  }
}
