import {
  Get,
  Body,
  Controller,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto';
import { SupplierProcurementTrendQueryDto } from './dto/supplier-procurement-trend-query.dto';
import { SupplierProcurementTrendResponseDto } from './dto/supplier-procurement-trend-response.dto';
import { SupplierProcurementSummaryQueryDto } from './dto/supplier-procurement-summary-query.dto';
import { SupplierProcurementSummaryResponseDto } from './dto/supplier-procurement-summary-response.dto';
import { UpdateSupplierProfileStatusDto } from './dto/update-supplier-profile-status.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers')
@Controller('suppliers/v1/profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SUPPLIER_ACCOUNT,
    UserRole.SUPPLIER_MANAGER,
    UserRole.SUPPLIER_OPERATOR,
  )
  findAll(@Req() req) {
    return this.suppliersService.findAllForUser({
      id: req.user?.id ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get(':id/procurement-summary')
  @ApiOperation({
    summary:
      'Get supplier procurement summary metrics, work queues, and recent orders',
  })
  @ApiQuery({ name: 'windowDays', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: SupplierProcurementSummaryResponseDto })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SUPPLIER_ACCOUNT,
    UserRole.SUPPLIER_MANAGER,
    UserRole.SUPPLIER_OPERATOR,
  )
  procurementSummary(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SupplierProcurementSummaryQueryDto,
    @Req() req,
  ) {
    return this.suppliersService.getProcurementSummary(id, query, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get(':id/procurement-trend')
  @ApiOperation({
    summary:
      'Get 7, 30, and 90 day supplier procurement trend snapshots and score deltas',
  })
  @ApiQuery({ name: 'branchIds', type: String, required: false })
  @ApiQuery({ name: 'statuses', type: String, required: false })
  @ApiQuery({ name: 'asOf', type: String, required: false })
  @ApiOkResponse({ type: SupplierProcurementTrendResponseDto })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SUPPLIER_ACCOUNT,
    UserRole.SUPPLIER_MANAGER,
    UserRole.SUPPLIER_OPERATOR,
  )
  procurementTrend(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SupplierProcurementTrendQueryDto,
    @Req() req,
  ) {
    return this.suppliersService.getProcurementTrend(id, query, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get(':id/procurement-trend/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export 7, 30, and 90 day supplier procurement trend snapshots and contributors as CSV',
  })
  @ApiQuery({ name: 'branchIds', type: String, required: false })
  @ApiQuery({ name: 'statuses', type: String, required: false })
  @ApiQuery({ name: 'asOf', type: String, required: false })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  async procurementTrendExport(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SupplierProcurementTrendQueryDto,
    @Req() req,
    @Res() res: Response,
  ) {
    const csv = await this.suppliersService.exportProcurementTrendCsv(
      id,
      query,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="supplier_procurement_trend_${id}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  create(@Body() dto: CreateSupplierProfileDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierProfileStatusDto,
    @Req() req,
  ) {
    return this.suppliersService.updateStatus(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }
}
