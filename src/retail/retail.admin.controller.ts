import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApplyRetailPlanPresetDto } from './dto/apply-retail-plan-preset.dto';
import { CreateRetailTenantDto } from './dto/create-retail-tenant.dto';
import { CreateTenantSubscriptionDto } from './dto/create-tenant-subscription.dto';
import { ListRetailTenantsQueryDto } from './dto/list-retail-tenants-query.dto';
import { UpdateRetailTenantOnboardingProfileDto } from './dto/update-retail-tenant-onboarding-profile.dto';
import {
  AppliedRetailPlanPresetResponseDto,
  RetailPlanPresetResponseDto,
} from './dto/retail-plan-preset-response.dto';
import { UpdateBranchRetailTenantDto } from './dto/update-branch-retail-tenant.dto';
import { UpsertTenantModuleEntitlementDto } from './dto/upsert-tenant-module-entitlement.dto';
import { RetailModule } from './entities/tenant-module-entitlement.entity';
import { RetailEntitlementsService } from './retail-entitlements.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiTags('Retail Admin')
@Controller('admin/retail-tenants')
export class RetailAdminController {
  constructor(
    private readonly retailEntitlementsService: RetailEntitlementsService,
  ) {}

  @Get('plan-presets')
  @ApiOperation({
    summary:
      'List Retail OS plan presets that the admin UI can use during tenant provisioning',
  })
  @ApiOkResponse({ type: RetailPlanPresetResponseDto, isArray: true })
  listPlanPresets() {
    return this.retailEntitlementsService.listPlanPresets();
  }

  @Get()
  listTenants(@Query() query: ListRetailTenantsQueryDto) {
    return this.retailEntitlementsService.listTenants(query);
  }

  @Get(':id')
  getTenant(@Param('id', ParseIntPipe) id: number) {
    return this.retailEntitlementsService.getTenant(id);
  }

  @Post()
  createTenant(@Body() dto: CreateRetailTenantDto) {
    return this.retailEntitlementsService.createTenant(dto);
  }

  @Post(':id/apply-plan-preset')
  @ApiOperation({
    summary:
      'Create a tenant subscription and apply the bundled Retail OS module entitlements for a preset',
  })
  @ApiOkResponse({ type: AppliedRetailPlanPresetResponseDto })
  applyPlanPreset(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyRetailPlanPresetDto,
  ) {
    return this.retailEntitlementsService.applyPlanPreset(id, dto);
  }

  @Patch('branches/:branchId/assignment')
  assignBranchToTenant(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: UpdateBranchRetailTenantDto,
  ) {
    return this.retailEntitlementsService.assignBranchToTenant(
      branchId,
      dto.retailTenantId,
    );
  }

  @Put(':id/modules/:module')
  upsertModuleEntitlement(
    @Param('id', ParseIntPipe) id: number,
    @Param('module') module: RetailModule,
    @Body() dto: UpsertTenantModuleEntitlementDto,
  ) {
    return this.retailEntitlementsService.upsertModuleEntitlement(
      id,
      module,
      dto,
    );
  }

  @Patch(':id/onboarding-profile')
  updateOnboardingProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRetailTenantOnboardingProfileDto,
  ) {
    return this.retailEntitlementsService.updateOnboardingProfile(id, dto);
  }

  @Post(':id/subscriptions')
  createSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTenantSubscriptionDto,
  ) {
    return this.retailEntitlementsService.createSubscription(id, dto);
  }
}
