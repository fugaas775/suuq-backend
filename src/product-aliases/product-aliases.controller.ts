import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateProductAliasDto } from './dto/create-product-alias.dto';
import {
  ImportProductAliasesDto,
  ImportProductAliasesResponseDto,
} from './dto/import-product-aliases.dto';
import { ListProductAliasesQueryDto } from './dto/list-product-aliases-query.dto';
import { ProductAlias } from './entities/product-alias.entity';
import { ProductAliasesService } from './product-aliases.service';

@ApiTags('Admin Product Aliases')
@Controller('admin/v1/product-aliases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductAliasesController {
  constructor(private readonly productAliasesService: ProductAliasesService) {}

  @Get()
  @ApiOperation({
    summary:
      'List product aliases for a retail tenant, branch, or partner credential scope',
  })
  @ApiQuery({ name: 'tenantId', type: Number, required: true })
  @ApiQuery({ name: 'branchId', type: Number, required: false })
  @ApiQuery({ name: 'partnerCredentialId', type: Number, required: false })
  @ApiQuery({ name: 'productId', type: Number, required: false })
  @ApiQuery({
    name: 'aliasType',
    enum: ['LOCAL_SKU', 'BARCODE', 'GTIN', 'EXTERNAL_PRODUCT_ID'],
    required: false,
  })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiOkResponse({ type: ProductAlias, isArray: true })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll(@Query() query: ListProductAliasesQueryDto) {
    return this.productAliasesService.findAll(query);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a tenant, branch, or partner-scoped product alias for POS integration',
  })
  @ApiCreatedResponse({ type: ProductAlias })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() dto: CreateProductAliasDto) {
    return this.productAliasesService.create(dto);
  }

  @Post('import')
  @ApiOperation({
    summary:
      'Import a batch of product aliases with row-level validation and duplicate detection',
  })
  @ApiCreatedResponse({ type: ImportProductAliasesResponseDto })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  import(@Body() dto: ImportProductAliasesDto) {
    return this.productAliasesService.importAliases(dto);
  }
}
