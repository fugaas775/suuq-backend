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
import { ProductResponseDto } from './dto/product-response.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UserRole } from '../auth/roles.enum';
import { ProductFilterDto } from './dto/ProductFilterDto'; // <-- Import the new DTO

@Controller('products')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  create(@Body() createProductDto: CreateProductDto, @Req() req: any) {
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

      // Pass the validated and transformed filters object directly to the service
      const result = await this.productsService.findFiltered(filters);

      if (!result || !Array.isArray(result.items)) {
        this.logger.error('findAll: result or result.items missing', result);
        throw new BadRequestException('Product list could not be loaded');
      }

      // Convert prices if currency is requested
      const items = currency && typeof currency === 'string'
        ? result.items.map((item) => {
            const itemCurrency = item.currency || '';
            if (itemCurrency === currency) return item;
            if (!itemCurrency) return item;
            return {
              ...item,
              price: this.productsService['currencyService'].convert(Number(item.price), String(itemCurrency), String(currency)),
              currency: String(currency),
            };
          })
        : result.items;

      return {
        ...result,
        items: plainToInstance(ProductResponseDto, items),
      };
    } catch (err) {
      this.logger.error('findAll error:', err);
      // Re-throw the error to be handled by NestJS's global exception filter
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

  @Get(':id/reviews')
  async getProductReviews(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.getReviewsForProduct(id);
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
    @Body('isBlocked', ParseIntPipe) isBlocked: boolean, // Use correct pipe
  ) {
    return this.productsService.toggleBlockStatus(id, isBlocked);
  }

  @Patch(':id/feature')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) // Allow Super Admin
  async toggleFeatureProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body('featured', ParseIntPipe) featured: boolean, // Use correct pipe
  ) {
    return this.productsService.toggleFeatureStatus(id, featured);
  }
}