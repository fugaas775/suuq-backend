import {
  Controller,
  Get,
  Query,
  UseGuards,
  Delete,
  Body,
  BadRequestException,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { EbirrService } from '../ebirr/ebirr.service';
import { AdminEbirrTransactionsQueryDto } from './dto/admin-ebirr-transactions-query.dto';
import { AdminEbirrReconcileReportQueryDto } from './dto/admin-ebirr-reconcile-report-query.dto';

@Controller('admin/ebirr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminEbirrAuditController {
  constructor(
    @InjectRepository(EbirrTransaction)
    private readonly ebirrRepo: Repository<EbirrTransaction>,
    private readonly ebirrService: EbirrService,
  ) {}

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTransactions(@Query() query: AdminEbirrTransactionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search ?? '';

    const queryBuilder = this.ebirrRepo
      .createQueryBuilder('et')
      .orderBy('et.request_timestamp', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (search) {
      queryBuilder.where(
        'et.merch_order_id LIKE :search OR et.req_transaction_id LIKE :search OR et.invoiceId LIKE :search OR et.payer_account LIKE :search',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await queryBuilder.getManyAndCount();

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

  @Post('reconcile/initiated')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reconcileInitiated(@Body() body: any) {
    return this.ebirrService.reconcileStuckInitiatedTransactions({
      olderThanMinutes: body?.olderThanMinutes,
      limit: body?.limit,
      dryRun: body?.dryRun,
    });
  }

  @Get('reconcile/initiated/report')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reconcileInitiatedReport(
    @Query() query: AdminEbirrReconcileReportQueryDto,
  ) {
    return this.ebirrService.reconcileStuckInitiatedTransactions({
      olderThanMinutes: query.olderThanMinutes,
      limit: query.limit,
      dryRun: true,
    });
  }
}
