import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSupplierOfferDto } from './dto/create-supplier-offer.dto';
import { SupplierOffer } from './entities/supplier-offer.entity';

@Injectable()
export class SupplierOffersService {
  constructor(
    @InjectRepository(SupplierOffer)
    private readonly supplierOffersRepository: Repository<SupplierOffer>,
  ) {}

  async create(dto: CreateSupplierOfferDto): Promise<SupplierOffer> {
    const offer = this.supplierOffersRepository.create({
      ...dto,
      fulfillmentRegions: dto.fulfillmentRegions ?? [],
    });
    return this.supplierOffersRepository.save(offer);
  }

  async findAll(): Promise<SupplierOffer[]> {
    return this.supplierOffersRepository.find({
      order: { createdAt: 'DESC' },
      relations: { supplierProfile: true, product: true },
    });
  }
}
