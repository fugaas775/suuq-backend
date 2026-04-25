import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { IngestPosCheckoutDto } from './dto/ingest-pos-checkout.dto';
import { PosCheckoutQuoteResponseDto } from './dto/pos-checkout-quote-response.dto';
import { ListPosCheckoutsQueryDto } from './dto/list-pos-checkouts-query.dto';
import { QuotePosCheckoutDto } from './dto/quote-pos-checkout.dto';
import { VoidPosCheckoutDto } from './dto/void-pos-checkout.dto';
import {
  PosCheckoutPageResponseDto,
  PosCheckoutResponseDto,
} from './dto/pos-checkout-response.dto';
import { TaxSummaryQueryDto } from './dto/tax-summary-query.dto';
import { TaxSummaryResponseDto } from './dto/tax-summary-response.dto';
import { PosCheckoutService } from './pos-checkout.service';

@ApiTags('POS Checkouts')
@Controller('pos/v1/checkouts')
export class PosCheckoutController {
  constructor(private readonly posCheckoutService: PosCheckoutService) {}

  @Post('quote')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosCheckoutQuoteResponseDto })
  quote(@Body() dto: QuotePosCheckoutDto) {
    return this.posCheckoutService.quote(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: PosCheckoutPageResponseDto })
  findAll(@Query() query: ListPosCheckoutsQueryDto) {
    return this.posCheckoutService.findAll(query);
  }

  @Get('reports/tax-summary')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: TaxSummaryResponseDto })
  getTaxSummary(@Query() query: TaxSummaryQueryDto) {
    return this.posCheckoutService.getTaxSummary(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: PosCheckoutResponseDto })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.posCheckoutService.findOne(id, branchId);
  }

  @Post(':id/void')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  voidCheckout(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchId: string,
    @Body() dto: VoidPosCheckoutDto,
    @Req() req,
  ) {
    const actorId: number = req.user?.id ?? req.user?.userId;
    const branchIdNum = branchId ? Number(branchId) : undefined;
    return this.posCheckoutService.voidCheckout(id, dto, actorId, branchIdNum);
  }

  @Post('ingest')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOkResponse({ type: PosCheckoutResponseDto })
  ingest(@Body() dto: IngestPosCheckoutDto, @Req() req) {
    return this.posCheckoutService.ingest(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }
}
