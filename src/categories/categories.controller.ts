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
  Req,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { Category } from './entities/category.entity';
import { Request, Response } from 'express';
import { createHash } from 'crypto';

@Controller('categories')
@UseInterceptors(ClassSerializerInterceptor)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(
    @Query('per_page', new DefaultValuePipe(0), ParseIntPipe) perPage: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Category[]> {
    // Cap per_page to a sane maximum
    const capped = Math.max(0, Math.min(perPage || 0, 200));
    res.setHeader('Cache-Control', 'public, max-age=60');
    return this.categoriesService.findAll(capped);
  }

  // Suggest categories by name or slug (lightweight for dropdowns)
  @Get('suggest')
  async suggest(
    @Query('q') q?: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ): Promise<
    Array<{ id: number; name: string; slug: string; parentId: number | null }>
  > {
    const lim = Math.min(Math.max(Number(limit) || 10, 1), 50);
    return this.categoriesService.suggest(q || '', lim);
  }

  @Get('tree')
  async getRootCategories(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<Category[] | void> {
    const roots = await this.categoriesService.findRoots();
    // Compute Last-Modified and ETag from latest updatedAt and IDs
    const timestamps: number[] = [];
    const hash = createHash('sha1');
    for (const r of roots) {
      if (r.updatedAt) timestamps.push(new Date(r.updatedAt).getTime());
      hash.update(`${r.id}:${r.updatedAt?.getTime() ?? ''};`);
      if (Array.isArray(r.children)) {
        for (const c of r.children) {
          if (c.updatedAt) timestamps.push(new Date(c.updatedAt).getTime());
          hash.update(`${c.id}:${c.updatedAt?.getTime() ?? ''};`);
        }
      }
    }
    const etag = `W/"${hash.digest('hex')}"`;
    res.setHeader('ETag', etag);

    if (timestamps.length) {
      const last = new Date(Math.max(...timestamps));
      res.setHeader('Last-Modified', last.toUTCString());
    }
    res.setHeader('Cache-Control', 'public, max-age=300');

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(304);
      return;
    }
    return roots;
  }

  @Head('tree')
  async headRootCategories(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ): Promise<void> {
    // Leverage the same logic to set headers without sending body
    await this.getRootCategories(res, req);
  }

  // Retrieve a single category by slug (public)
  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<Category | null> {
    return this.categoriesService.findBySlug(slug);
  }

  // Retrieve a category with its descendants by slug (public)
  @Get(':slug/descendants')
  async descendantsBySlug(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Category> {
    const cat = await this.categoriesService.findDescendantsBySlug(slug);
    res.setHeader('Cache-Control', 'public, max-age=120');
    return cat;
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
