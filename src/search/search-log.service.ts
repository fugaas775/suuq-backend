import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchLog } from './entities/search-log.entity';
import { SearchLogDto } from './dto/search-log.dto';

@Injectable()
export class SearchLogService {
  constructor(
    @InjectRepository(SearchLog)
    private readonly searchLogRepo: Repository<SearchLog>,
  ) {}

  async log(
    dto: SearchLogDto,
    context?: {
      userId?: number | null;
      ip?: string | null;
      ua?: string | null;
    },
  ) {
    const entity = this.searchLogRepo.create({
      query: dto.query,
      resultCount: dto.result_count,
      source: dto.source ?? null,
      categoryId: dto.category_id ?? null,
      city: dto.city ?? null,
      userId: context?.userId ?? null,
      ipAddress: context?.ip ?? null,
      userAgent: context?.ua ?? null,
    });
    return this.searchLogRepo.save(entity);
  }
}
