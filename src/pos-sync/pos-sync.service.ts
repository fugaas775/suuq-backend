import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePosSyncJobDto } from './dto/create-pos-sync-job.dto';
import { PosSyncJob } from './entities/pos-sync-job.entity';

@Injectable()
export class PosSyncService {
  constructor(
    @InjectRepository(PosSyncJob)
    private readonly posSyncJobsRepository: Repository<PosSyncJob>,
  ) {}

  async create(dto: CreatePosSyncJobDto): Promise<PosSyncJob> {
    const syncJob = this.posSyncJobsRepository.create(dto);
    return this.posSyncJobsRepository.save(syncJob);
  }

  async findAll(): Promise<PosSyncJob[]> {
    return this.posSyncJobsRepository.find({
      order: { createdAt: 'DESC' },
      relations: { branch: true, partnerCredential: true },
    });
  }
}
