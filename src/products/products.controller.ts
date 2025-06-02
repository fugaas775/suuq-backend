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
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { ProductResponseDto } from './dto/product-response.dto';
import { CreateProductDto } from './dto/create-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('VENDOR')
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
      tags: tag, // ✅ mapped correctly
    });

    return {
      ...result,
      items: plainToInstance(ProductResponseDto, result.items),
    };
  }

  @Get('suggest')
  async suggest(@Query('q') q: string) {
    return this.productsService.suggestNames(q); // ✅ now calls service
  }

  @Get('/tags/suggest')
  suggestTags(@Query('q') q: string) {
    return this.productsService.suggestNames(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('VENDOR')
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @Req() req: any,
  ) {
    return this.productsService.updateProduct(id, updateProductDto, req.user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('VENDOR')
  deleteProduct(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.productsService.deleteProduct(id, req.user);
  }
}
