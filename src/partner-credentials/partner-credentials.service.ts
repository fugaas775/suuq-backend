import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Branch } from '../branches/entities/branch.entity';
import { CreatePartnerCredentialDto } from './dto/create-partner-credential.dto';
import {
  PartnerCredentialListQueryDto,
  PartnerCredentialSortField,
  SortDirection,
} from './dto/partner-credential-list-query.dto';
import {
  PartnerCredential,
  PartnerCredentialStatus,
  PartnerType,
} from './entities/partner-credential.entity';

@Injectable()
export class PartnerCredentialsService {
  constructor(
    @InjectRepository(PartnerCredential)
    private readonly partnerCredentialsRepository: Repository<PartnerCredential>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreatePartnerCredentialDto): Promise<PartnerCredential> {
    await this.assertBranchBinding(dto);

    const credential = this.partnerCredentialsRepository.create({
      ...dto,
      scopes: dto.scopes ?? [],
      keyHash: this.normalizeCredentialSecret(dto.keyHash),
    });
    return this.partnerCredentialsRepository.save(credential);
  }

  async findAll(query: PartnerCredentialListQueryDto = {}): Promise<{
    items: PartnerCredential[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);
    const sortBy = query.sortBy ?? PartnerCredentialSortField.CREATED_AT;
    const sortDirection = query.sortDirection ?? SortDirection.DESC;
    const secondarySortBy = query.secondarySortBy;
    const secondarySortDirection =
      query.secondarySortDirection ?? SortDirection.DESC;

    const qb = this.partnerCredentialsRepository
      .createQueryBuilder('credential')
      .leftJoinAndSelect('credential.branch', 'branch')
      .orderBy(`credential.${sortBy}`, sortDirection, 'NULLS LAST')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (secondarySortBy && secondarySortBy !== sortBy) {
      qb.addOrderBy(
        `credential.${secondarySortBy}`,
        secondarySortDirection,
        'NULLS LAST',
      );
    }

    if (sortBy !== PartnerCredentialSortField.CREATED_AT) {
      qb.addOrderBy('credential.createdAt', 'DESC');
    }

    if (query.partnerType) {
      qb.andWhere('credential.partnerType = :partnerType', {
        partnerType: query.partnerType,
      });
    }

    if (query.status) {
      qb.andWhere('credential.status = :status', {
        status: query.status,
      });
    }

    if (query.branchId != null) {
      qb.andWhere('credential.branchId = :branchId', {
        branchId: query.branchId,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        "(LOWER(credential.name) LIKE :search OR LOWER(COALESCE(branch.name, '')) LIKE :search)",
        {
          search: `%${query.search.trim().toLowerCase()}%`,
        },
      );
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async revoke(
    id: number,
    actor: { id?: number | null; email?: string | null; reason?: string } = {},
  ): Promise<PartnerCredential> {
    const credential = await this.partnerCredentialsRepository.findOne({
      where: { id },
    });

    if (!credential) {
      throw new NotFoundException(`Partner credential with ID ${id} not found`);
    }

    if (credential.status !== PartnerCredentialStatus.REVOKED) {
      credential.status = PartnerCredentialStatus.REVOKED;
      credential.revokedAt = new Date();
      credential.revokedByUserId = actor.id ?? null;
      credential.revocationReason = actor.reason ?? null;
      await this.partnerCredentialsRepository.save(credential);
      await this.auditService.log({
        action: 'partner_credential.revoke',
        targetType: 'PARTNER_CREDENTIAL',
        targetId: id,
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        reason: actor.reason ?? null,
        meta: {
          status: PartnerCredentialStatus.REVOKED,
          partnerType: credential.partnerType,
        },
      });
    }

    return credential;
  }

  async rotateBranchAssignment(
    id: number,
    nextBranchId: number,
    actor: { id?: number | null; email?: string | null; reason?: string } = {},
  ): Promise<PartnerCredential> {
    const credential = await this.partnerCredentialsRepository.findOne({
      where: { id },
    });

    if (!credential) {
      throw new NotFoundException(`Partner credential with ID ${id} not found`);
    }

    if (credential.partnerType !== PartnerType.POS) {
      throw new BadRequestException(
        'Only POS partner credentials can rotate branch assignment',
      );
    }

    const branch = await this.branchesRepository.findOne({
      where: { id: nextBranchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${nextBranchId} not found`);
    }

    const previousBranchId = credential.branchId ?? null;
    if (previousBranchId === nextBranchId) {
      return credential;
    }

    credential.branchId = nextBranchId;
    await this.partnerCredentialsRepository.save(credential);
    await this.auditService.log({
      action: 'partner_credential.branch.rotate',
      targetType: 'PARTNER_CREDENTIAL',
      targetId: id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: actor.reason ?? null,
      meta: {
        partnerType: credential.partnerType,
        previousBranchId,
        nextBranchId,
      },
    });

    return credential;
  }

  assertCredentialBranchAccess(
    credential: PartnerCredential,
    branchId: number,
  ): void {
    if (credential.partnerType !== PartnerType.POS) {
      return;
    }

    if (credential.branchId == null) {
      throw new UnauthorizedException(
        'POS partner credential is not bound to a branch',
      );
    }

    if (credential.branchId !== branchId) {
      throw new UnauthorizedException(
        `Partner credential is not authorized for branch ${branchId}`,
      );
    }
  }

  async authenticatePosCredential(
    presentedKey: string,
    requiredScopes: string[] = ['sync:write'],
  ): Promise<PartnerCredential> {
    const candidates = await this.partnerCredentialsRepository.find({
      where: {
        partnerType: PartnerType.POS,
        status: PartnerCredentialStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });

    const credential = candidates.find((item) =>
      this.matchesPresentedKey(presentedKey, item.keyHash),
    );

    if (!credential) {
      throw new UnauthorizedException('Invalid partner credential');
    }

    if (requiredScopes.length > 0) {
      const scopes = credential.scopes ?? [];
      const hasScope = requiredScopes.some((scope) => scopes.includes(scope));
      if (!hasScope) {
        throw new UnauthorizedException(
          'Partner credential is missing required POS sync scope',
        );
      }
    }

    credential.lastUsedAt = new Date();
    await this.partnerCredentialsRepository.save(credential);
    return credential;
  }

  private normalizeCredentialSecret(secret: string): string {
    const trimmed = String(secret || '').trim();
    if (/^[a-f0-9]{64}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }

    return createHash('sha256').update(trimmed).digest('hex');
  }

  private matchesPresentedKey(
    presentedKey: string,
    storedHash: string,
  ): boolean {
    const normalizedPresented = this.normalizeCredentialSecret(presentedKey);
    const normalizedStored = String(storedHash || '')
      .trim()
      .toLowerCase();

    const presentedBuffer = Buffer.from(normalizedPresented);
    const storedBuffer = Buffer.from(normalizedStored);
    if (presentedBuffer.length === storedBuffer.length) {
      return timingSafeEqual(presentedBuffer, storedBuffer);
    }

    return normalizedPresented === normalizedStored;
  }

  private async assertBranchBinding(
    dto: CreatePartnerCredentialDto,
  ): Promise<void> {
    if (dto.partnerType === PartnerType.POS && dto.branchId == null) {
      throw new BadRequestException(
        'POS partner credentials must be bound to a branchId',
      );
    }

    if (dto.branchId == null) {
      return;
    }

    const branch = await this.branchesRepository.findOne({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${dto.branchId} not found`);
    }
  }
}
