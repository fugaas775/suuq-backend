import { Body, Controller, Post, Get, Query, Patch, ParseIntPipe, Req, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('VENDOR')
  create(@Body() body: any, @Request() req: any) {
   return this.productsService.create({
     name: body.name,
     price: body.price,
     description: body.description,
     vendor: { id: req.user.id } as any, // ✅ safely bypasses TS check
   });
  }

  @Get()
findAll(
  @Query('vendorId') vendorId?: string,
  @Query('featured') featured?: string,
  @Query('per_page') perPage?: string,
  @Query('page') page?: string,
  @Query('category') category?: string,
  @Query('search') search?: string,
  @Query('orderby') orderby?: string,
) {
  if (vendorId) {
    return this.productsService.findByVendorId(+vendorId);
  }

  return this.productsService.findFiltered({
    featured: featured === 'true',
    perPage: +(perPage ?? 10),
    page: +(page ?? 1),
    categoryId: category ? +category : undefined,
    search: search || '',
    orderby: orderby || 'date',
  });
}


  

  @Get(':id')
  findOne(@Param('id') id: string) {
   return this.productsService.findOne(+id);
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
  deleteProduct(
   @Param('id', ParseIntPipe) id: number,
   @Req() req: any,
 ) {
   return this.productsService.deleteProduct(id, req.user);
  }

}

