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
import { UserRole } from '../constants/roles'; // Import the enum

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN) // Use enum, not string
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN) // Use enum, not string
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN) // Use enum, not string
  @Delete(':id')
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
