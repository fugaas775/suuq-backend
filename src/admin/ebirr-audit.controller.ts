import {
  Controller,
  Get,
  Query,
  UseGuards,
  Delete,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('admin/ebirr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminEbirrAuditController {
  constructor(
    @InjectRepository(EbirrTransaction)
    private readonly ebirrRepo: Repository<EbirrTransaction>,
  ) {}

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTransactions(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('search') search = '',
  ) {
    const query = this.ebirrRepo
      .createQueryBuilder('et')
      .orderBy('et.request_timestamp', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (search) {
      query.where(
        'et.merch_order_id LIKE :search OR et.req_transaction_id LIKE :search OR et.invoiceId LIKE :search OR et.payer_account LIKE :search',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page: Number(page),
      last_page: Math.ceil(total / limit),
    };
  }

  @Delete('transactions')
  @Roles(UserRole.SUPER_ADMIN)
  async deleteTransactions(@Body('ids') ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids array is required');
    }

    const result = await this.ebirrRepo.delete(ids);
    return { deleted: result.affected || 0 };
  }
}
