import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum'; // Updated import!

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.delete(id);
  }

  @Get('tree')
  getRootCategories() {
    return this.categoriesService.findRoots();
  }

  @Get(':slug/tree')
  getDescendantsBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findDescendantsBySlug(slug);
  }

  @Get(':slug/products')
  getProductsByCategorySlug(@Param('slug') slug: string) {
    return this.categoriesService.findProductsByCategorySlug(slug);
  }

  @Get(':slug')
  findOneBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }
}