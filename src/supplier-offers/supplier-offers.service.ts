import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import {
  SupplierProfile,
  SupplierOnboardingStatus,
} from '../suppliers/entities/supplier-profile.entity';
import { CreateSupplierOfferDto } from './dto/create-supplier-offer.dto';
import { UpdateSupplierOfferDto } from './dto/update-supplier-offer.dto';
import { UpdateSupplierOfferStatusDto } from './dto/update-supplier-offer-status.dto';
import {
  SupplierAvailabilityStatus,
  SupplierOffer,
  SupplierOfferStatus,
} from './entities/supplier-offer.entity';

const SUPPLIER_OFFER_TRANSITIONS: Record<
  SupplierOfferStatus,
  SupplierOfferStatus[]
> = {
  [SupplierOfferStatus.DRAFT]: [
    SupplierOfferStatus.PUBLISHED,
    SupplierOfferStatus.ARCHIVED,
  ],
  [SupplierOfferStatus.PUBLISHED]: [SupplierOfferStatus.ARCHIVED],
  [SupplierOfferStatus.ARCHIVED]: [SupplierOfferStatus.DRAFT],
};

@Injectable()
export class SupplierOffersService {
  constructor(
    @InjectRepository(SupplierOffer)
    private readonly supplierOffersRepository: Repository<SupplierOffer>,
    @InjectRepository(SupplierProfile)
    private readonly supplierProfilesRepository: Repository<SupplierProfile>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async create(dto: CreateSupplierOfferDto): Promise<SupplierOffer> {
    const supplierProfile = await this.supplierProfilesRepository.findOne({
      where: { id: dto.supplierProfileId },
    });
    if (!supplierProfile) {
      throw new NotFoundException(
        `Supplier profile with ID ${dto.supplierProfileId} not found`,
      );
    }

    const product = await this.productsRepository.findOne({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
    }

    const offer = this.supplierOffersRepository.create({
      ...dto,
      fulfillmentRegions: dto.fulfillmentRegions ?? [],
      status: SupplierOfferStatus.DRAFT,
      availabilityStatus:
        dto.availabilityStatus ?? SupplierAvailabilityStatus.IN_STOCK,
    });
    await this.supplierOffersRepository.save(offer);
    return this.findOneById(offer.id);
  }

  async findAll(): Promise<SupplierOffer[]> {
    return this.supplierOffersRepository.find({
      order: { createdAt: 'DESC' },
      relations: { supplierProfile: true, product: true },
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateSupplierOfferStatusDto,
  ): Promise<SupplierOffer> {
    const offer = await this.findOneById(id);
    const nextStatus = dto.status;

    if (offer.status === nextStatus) {
      return offer;
    }

    const allowedTransitions = SUPPLIER_OFFER_TRANSITIONS[offer.status] ?? [];
    if (!allowedTransitions.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid supplier offer transition from ${offer.status} to ${nextStatus}`,
      );
    }

    if (
      nextStatus === SupplierOfferStatus.PUBLISHED &&
      offer.supplierProfile.onboardingStatus !==
        SupplierOnboardingStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Supplier offers can only be published after supplier profile approval',
      );
    }

    offer.status = nextStatus;
    await this.supplierOffersRepository.save(offer);
    return this.findOneById(id);
  }
  async update(
    id: number,
    dto: UpdateSupplierOfferDto,
  ): Promise<SupplierOffer> {
    const offer = await this.findOneById(id);
    if (dto.unitWholesalePrice !== undefined) {
      offer.unitWholesalePrice = dto.unitWholesalePrice;
    }
    if (dto.currency !== undefined) {
      offer.currency = dto.currency.toUpperCase();
    }
    if (dto.availabilityStatus !== undefined) {
      offer.availabilityStatus = dto.availabilityStatus;
    }
    if (dto.moq !== undefined) {
      offer.moq = dto.moq;
    }
    if (dto.leadTimeDays !== undefined) {
      offer.leadTimeDays = dto.leadTimeDays;
    }
    if (dto.fulfillmentRegions !== undefined) {
      offer.fulfillmentRegions = dto.fulfillmentRegions;
    }
    await this.supplierOffersRepository.save(offer);
    return this.findOneById(offer.id);
  }
  private async findOneById(id: number): Promise<SupplierOffer> {
    const offer = await this.supplierOffersRepository.findOne({
      where: { id },
      relations: { supplierProfile: true, product: true },
    });

    if (!offer) {
      throw new NotFoundException(`Supplier offer with ID ${id} not found`);
    }

    return offer;
  }
}
