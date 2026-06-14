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
  SupplierOnboardingStatus,
  SupplierProfile,
} from '../suppliers/entities/supplier-profile.entity';
import {
  SupplierAvailabilityStatus,
  SupplierOffer,
  SupplierOfferStatus,
} from './entities/supplier-offer.entity';
import { CreateSupplierOfferDto } from './dto/create-supplier-offer.dto';
import { UpdateSupplierOfferDto } from './dto/update-supplier-offer.dto';

/**
 * Supplier-facing catalog management. Every operation is scoped to the supplier
 * profile owned by the acting user (resolved from userId), so a supplier can
 * only ever read/mutate their own offers. The buyer-facing browse remains in
 * PurchaseOrdersService.findAvailableOffers, which is the single source of truth
 * for which offers surface to buyers (PUBLISHED + APPROVED + active) — publish
 * here just flips status to PUBLISHED once the supplier is APPROVED.
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
  ) {}

  async listForUser(
    userId: number | null | undefined,
  ): Promise<SupplierOffer[]> {
    const profile = await this.resolveProfileOrThrow(userId);
    return this.offersRepository.find({
      where: { supplierProfileId: profile.id },
      order: { createdAt: 'DESC' },
      relations: { product: true },
    });
  }

  async createForUser(
    userId: number | null | undefined,
    dto: CreateSupplierOfferDto,
  ): Promise<SupplierOffer> {
    const profile = await this.resolveProfileOrThrow(userId);
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

  async updateForUser(
    userId: number | null | undefined,
    id: number,
    dto: UpdateSupplierOfferDto,
  ): Promise<SupplierOffer> {
    const offer = await this.findOwnedOfferOrThrow(userId, id);
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
  ): Promise<SupplierOffer> {
    const offer = await this.findOwnedOfferOrThrow(userId, id);
    const profile = await this.profilesRepository.findOne({
      where: { id: offer.supplierProfileId },
    });
    if (profile?.onboardingStatus !== SupplierOnboardingStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved suppliers can publish offers',
      );
    }
    if (!profile.isActive) {
      throw new BadRequestException('Inactive suppliers cannot publish offers');
    }
    offer.status = SupplierOfferStatus.PUBLISHED;
    return this.offersRepository.save(offer);
  }

  async archiveForUser(
    userId: number | null | undefined,
    id: number,
  ): Promise<SupplierOffer> {
    const offer = await this.findOwnedOfferOrThrow(userId, id);
    offer.status = SupplierOfferStatus.ARCHIVED;
    return this.offersRepository.save(offer);
  }

  // ---- Helpers -------------------------------------------------------------

  private async resolveProfileOrThrow(
    userId: number | null | undefined,
  ): Promise<SupplierProfile> {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }
    const profile = await this.profilesRepository.findOne({
      where: { userId },
    });
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
  ): Promise<SupplierOffer> {
    const profile = await this.resolveProfileOrThrow(userId);
    const offer = await this.offersRepository.findOne({ where: { id } });
    if (!offer) {
      throw new NotFoundException(`Supplier offer ${id} not found`);
    }
    if (offer.supplierProfileId !== profile.id) {
      throw new ForbiddenException('You can only manage your own offers');
    }
    return offer;
  }
}
