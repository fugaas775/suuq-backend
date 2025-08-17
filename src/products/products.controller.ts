import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UserRole } from '../auth/roles.enum';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { UseInterceptors, ParseBoolPipe } from '@nestjs/common';

@UseInterceptors(ClassSerializerInterceptor)
@Controller('products')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  create(@Body() createProductDto: CreateProductDto, @Req() req: any) {
    console.log('Raw request body:', JSON.stringify(req.body));
    console.log('Parsed DTO:', JSON.stringify(createProductDto));
    return this.productsService.create({
      ...createProductDto,
      vendorId: req.user.id,
    });
  }

  // --- UPDATED: This method now uses the ProductFilterDto ---
  @Get()
  async findAll(@Query() filters: ProductFilterDto, @Query('currency') currency?: string) {
    try {
      this.logger.debug(`findAll filters: ${JSON.stringify(filters)}, currency: ${currency}`);

      // Support both limit and perPage for pagination
      if (filters.limit && !filters.perPage) {
        filters.perPage = filters.limit;
      }

      const result = await this.productsService.findFiltered(filters);

      if (!result || !Array.isArray(result.items)) {
        this.logger.error('findAll: result or result.items missing', result);
        throw new BadRequestException('Product list could not be loaded');
      }

      // No manual conversion or DTO mapping; return result.items directly
      return {
        ...result,
        items: result.items,
      };
    } catch (err) {
      this.logger.error('findAll error:', err);
      throw err;
    }
  }

  @Get('suggest')
  async suggest(@Query('q') q: string) {
    return this.productsService.suggestNames(q);
  }

  @Get('/tags/suggest')
  suggestTags(@Query('q') q: string) {
    // TODO: Replace with actual tag suggestion service if available
    return this.productsService.suggestNames(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  // Personalized recommendations for the current user
  @UseGuards(AuthGuard('jwt'))
  @Get('recommended')
  async recommended(
    @Req() req: any,
    @Query('page') page = 1,
    @Query('per_page') perPage = 20,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException('Unauthorized');
    return this.productsService.recommendedForUser(Number(userId), Number(page) || 1, Number(perPage) || 20);
  }


  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @Req() req: any,
  ) {
    return this.productsService.updateProduct(id, updateProductDto, req.user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  deleteProduct(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.productsService.deleteProduct(id, req.user);
  }

  @Patch(':id/block')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) // Allow Super Admin
  async toggleBlockProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body('isBlocked', ParseBoolPipe) isBlocked: boolean, // Use correct pipe
  ) {
    return this.productsService.toggleBlockStatus(id, isBlocked);
  }

  @Patch(':id/feature')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) // Allow Super Admin
  async toggleFeatureProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body('featured', ParseBoolPipe) featured: boolean, // Use correct pipe
  ) {
    return this.productsService.toggleFeatureStatus(id, featured);
  }
}