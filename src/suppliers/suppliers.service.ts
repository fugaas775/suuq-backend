import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto';
import { SupplierProfile } from './entities/supplier-profile.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(SupplierProfile)
    private readonly supplierProfilesRepository: Repository<SupplierProfile>,
  ) {}

  async create(dto: CreateSupplierProfileDto): Promise<SupplierProfile> {
    const profile = this.supplierProfilesRepository.create({
      ...dto,
      countriesServed: dto.countriesServed ?? [],
    });
    return this.supplierProfilesRepository.save(profile);
  }

  async findAll(): Promise<SupplierProfile[]> {
    return this.supplierProfilesRepository.find({
      order: { createdAt: 'DESC' },
      relations: { user: true },
    });
  }
}
