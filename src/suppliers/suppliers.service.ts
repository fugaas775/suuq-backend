import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { User } from '../users/entities/user.entity';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto';
import { UpdateSupplierProfileStatusDto } from './dto/update-supplier-profile-status.dto';
import {
  SupplierOnboardingStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';

const SUPPLIER_PROFILE_TRANSITIONS: Record<
  SupplierOnboardingStatus,
  SupplierOnboardingStatus[]
> = {
  [SupplierOnboardingStatus.DRAFT]: [SupplierOnboardingStatus.PENDING_REVIEW],
  [SupplierOnboardingStatus.PENDING_REVIEW]: [
    SupplierOnboardingStatus.APPROVED,
    SupplierOnboardingStatus.REJECTED,
  ],
  [SupplierOnboardingStatus.APPROVED]: [],
  [SupplierOnboardingStatus.REJECTED]: [
    SupplierOnboardingStatus.PENDING_REVIEW,
  ],
};

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(SupplierProfile)
    private readonly supplierProfilesRepository: Repository<SupplierProfile>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateSupplierProfileDto): Promise<SupplierProfile> {
    const user = await this.usersRepository.findOne({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    const profile = this.supplierProfilesRepository.create({
      ...dto,
      countriesServed: dto.countriesServed ?? [],
      onboardingStatus: SupplierOnboardingStatus.DRAFT,
    });
    await this.supplierProfilesRepository.save(profile);
    return this.findOneById(profile.id);
  }

  async findAll(): Promise<SupplierProfile[]> {
    return this.supplierProfilesRepository.find({
      order: { createdAt: 'DESC' },
      relations: { user: true },
    });
  }

  async findReviewQueue(
    status: SupplierOnboardingStatus = SupplierOnboardingStatus.PENDING_REVIEW,
  ): Promise<SupplierProfile[]> {
    return this.supplierProfilesRepository.find({
      where: { onboardingStatus: status },
      order: { createdAt: 'ASC' },
      relations: { user: true },
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateSupplierProfileStatusDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
      reason?: string;
    } = {},
  ): Promise<SupplierProfile> {
    const profile = await this.findOneById(id);
    const nextStatus = dto.status;
    const roles = actor.roles ?? [];
    const previousStatus = profile.onboardingStatus;

    if (previousStatus === nextStatus) {
      return profile;
    }

    const allowedTransitions =
      SUPPLIER_PROFILE_TRANSITIONS[previousStatus] ?? [];
    if (!allowedTransitions.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid supplier profile transition from ${profile.onboardingStatus} to ${nextStatus}`,
      );
    }

    if (
      [
        SupplierOnboardingStatus.APPROVED,
        SupplierOnboardingStatus.REJECTED,
      ].includes(nextStatus) &&
      !this.hasAnyRole(roles, [UserRole.SUPER_ADMIN, UserRole.ADMIN])
    ) {
      throw new ForbiddenException(
        `Only admins can move supplier profiles to ${nextStatus}`,
      );
    }

    if (
      nextStatus === SupplierOnboardingStatus.PENDING_REVIEW &&
      !this.hasAnyRole(roles, [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.SUPPLIER_ACCOUNT,
      ])
    ) {
      throw new ForbiddenException(
        'Only supplier accounts or admins can submit supplier profiles for review',
      );
    }

    profile.onboardingStatus = nextStatus;
    await this.supplierProfilesRepository.save(profile);

    await this.auditService.log({
      action: 'supplier_profile.status.update',
      targetType: 'SUPPLIER_PROFILE',
      targetId: id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: actor.reason ?? null,
      meta: {
        fromStatus: previousStatus,
        toStatus: nextStatus,
      },
    });

    return this.findOneById(id);
  }

  private async findOneById(id: number): Promise<SupplierProfile> {
    const profile = await this.supplierProfilesRepository.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!profile) {
      throw new NotFoundException(`Supplier profile with ID ${id} not found`);
    }

    return profile;
  }

  private hasAnyRole(roles: string[], allowedRoles: UserRole[]): boolean {
    return allowedRoles.some((role) => roles.includes(role));
  }
}
