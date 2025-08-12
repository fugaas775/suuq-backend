import {
  Controller,
  Get,
  Head,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Query,
  DefaultValuePipe,
  UseInterceptors,
  ClassSerializerInterceptor,
  Res,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { Category } from './entities/category.entity';
import { Response } from 'express';

@Controller('categories')
@UseInterceptors(ClassSerializerInterceptor)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(
    @Query('per_page', new DefaultValuePipe(0), ParseIntPipe) perPage: number,
  ): Promise<Category[]> {
    return this.categoriesService.findAll(perPage);
  }

  @Get('tree')
  async getRootCategories(@Res({ passthrough: true }) res: Response): Promise<Category[]> {
    const roots = await this.categoriesService.findRoots();
    // Compute Last-Modified from latest updatedAt across roots and children
    const timestamps: number[] = [];
    for (const r of roots) {
      if (r.updatedAt) timestamps.push(new Date(r.updatedAt).getTime());
      if (Array.isArray(r.children)) {
        for (const c of r.children) {
          if (c.updatedAt) timestamps.push(new Date(c.updatedAt).getTime());
        }
      }
    }
    if (timestamps.length) {
      const last = new Date(Math.max(...timestamps));
      res.setHeader('Last-Modified', last.toUTCString());
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    return roots;
  }

  @Head('tree')
  async headRootCategories(@Res({ passthrough: true }) res: Response): Promise<void> {
    // Leverage the same logic to set headers without sending body
    await this.getRootCategories(res);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() createCategoryDto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(createCategoryDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  delete(@Param('id', ParseIntPipe) id: number): Promise<{ deleted: boolean }> {
    return this.categoriesService.delete(id);
  }
}
