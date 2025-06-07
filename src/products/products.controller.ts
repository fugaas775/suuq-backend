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
  ParseBoolPipe,
  BadRequestException,
  Logger
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

  @Get()
  async findAll(
    @Query('per_page') perPageQuery?: string,
    @Query('page') pageQuery?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('featured') featured?: string,
    @Query('sort') sort?: string,
    @Query('categorySlug') categorySlug?: string,
    @Query('tag') tag?: string,
  ) {
    try {
      this.logger.debug(`findAll params: ${JSON.stringify({
        perPageQuery, pageQuery, search, categoryId, featured, sort, categorySlug, tag
      })}`);

      const perPage = parseInt(perPageQuery || '10', 10);
      const page = parseInt(pageQuery || '1', 10);
      const catId = categoryId ? parseInt(categoryId, 10) : undefined;
      const isFeatured =
        featured === 'true' ? true : featured === 'false' ? false : undefined;

      if (isNaN(perPage) || isNaN(page)) {
        throw new BadRequestException('Invalid pagination values');
      }

      const result = await this.productsService.findFiltered({
        perPage,
        page,
        search,
        categoryId: catId,
        featured: isFeatured,
        sort,
        categorySlug,
        tags: tag,
      });

      if (!result || !Array.isArray(result.items)) {
        this.logger.error('findAll: result or result.items missing', result);
        throw new BadRequestException('Product list could not be loaded');
      }

      return {
        ...result,
        items: plainToInstance(ProductResponseDto, result.items),
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
  @Roles(UserRole.ADMIN)
  async toggleBlockProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body('isBlocked', ParseBoolPipe) isBlocked: boolean
  ) {
    return this.productsService.toggleBlockStatus(id, isBlocked);
  }

  @Patch(':id/feature')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async toggleFeatureProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body('featured', ParseBoolPipe) featured: boolean
  ) {
    return this.productsService.toggleFeatureStatus(id, featured);
  }
}