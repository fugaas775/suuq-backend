import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosCatalogSearchQueryDto } from './dto/pos-catalog-search-query.dto';
import { PosCatalogSearchResponseDto } from './dto/pos-catalog-search-response.dto';
import { PosCatalogService } from './pos-catalog.service';

@ApiTags('POS Catalog')
@Controller('pos/v1/catalog')
export class PosCatalogController {
  constructor(private readonly posCatalogService: PosCatalogService) {}

  @Get('search')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: PosCatalogSearchResponseDto })
  search(@Query() query: PosCatalogSearchQueryDto) {
    return this.posCatalogService.search(query);
  }
}
