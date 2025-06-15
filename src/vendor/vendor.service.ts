import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vendor } from './entities/vendor.entity';

@Injectable()
export class VendorService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
  ) {}

  async findById(vendorId: string | number): Promise<Vendor | undefined> {
    const id = Number(vendorId);
    if (isNaN(id)) return undefined;
    const vendor = await this.vendorRepo.findOne({ where: { id } });
    return vendor === null ? undefined : vendor;
  }

  async getPublicProfile(vendorId: string | number): Promise<Partial<Vendor> | undefined> {
    const id = Number(vendorId);
    if (isNaN(id)) return undefined;
    const vendor = await this.vendorRepo.findOne({
      where: { id },
      select: [
        'id',
        'store_name',
        'avatar_url',
        'about',
        'verified',
        'registration_country',
        'registration_city',
        'registration_region',
        'years_on_platform',
        'facebook_url',
        'instagram_url',
        'twitter_url',
        'telegram_url',
        'tiktok_url',
        'website',
        'createdAt',
        'rating',
        'number_of_sales',
      ],
    });
    return vendor === null ? undefined : vendor;
  }

  async findAll(): Promise<Vendor[]> {
    return this.vendorRepo.find();
  }

  async create(data: Partial<Vendor>): Promise<Vendor> {
    const vendor = this.vendorRepo.create(data);
    return this.vendorRepo.save(vendor);
  }

  async update(vendorId: string | number, data: Partial<Vendor>): Promise<Vendor | undefined> {
    const id = Number(vendorId);
    if (isNaN(id)) return undefined;
    const vendor = await this.vendorRepo.findOne({ where: { id } });
    if (!vendor) return undefined;
    Object.assign(vendor, data);
    return this.vendorRepo.save(vendor);
  }
}