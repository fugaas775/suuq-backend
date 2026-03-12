import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePartnerCredentialDto } from './dto/create-partner-credential.dto';
import { PartnerCredential } from './entities/partner-credential.entity';

@Injectable()
export class PartnerCredentialsService {
  constructor(
    @InjectRepository(PartnerCredential)
    private readonly partnerCredentialsRepository: Repository<PartnerCredential>,
  ) {}

  async create(dto: CreatePartnerCredentialDto): Promise<PartnerCredential> {
    const credential = this.partnerCredentialsRepository.create({
      ...dto,
      scopes: dto.scopes ?? [],
    });
    return this.partnerCredentialsRepository.save(credential);
  }

  async findAll(): Promise<PartnerCredential[]> {
    return this.partnerCredentialsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }
}
