import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TreeRepository, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Product } from '../products/entities/product.entity';
import { slugify } from 'transliteration';
import { CategoryResponseDto } from './dto/category-response.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: TreeRepository<Category>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findRoots(): Promise<Category[]> {
    return this.categoryRepo.findRoots({
      relations: ['children'],
    });
  }

  async findDescendantsBySlug(slug: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    return this.categoryRepo.findDescendantsTree(category);
  }

  async findAll(perPage = 10): Promise<CategoryResponseDto[]> {
    const categories = await this.categoryRepo.find({
      order: { name: 'ASC' },
      take: perPage,
    });

    // Map to CategoryResponseDto with icon fallback logic
    return categories.map((cat) => {
      let iconName: string | undefined = cat.iconName && cat.iconName.trim() !== '' ? cat.iconName : undefined;
      let iconUrl: string | undefined = cat.iconUrl && cat.iconUrl.trim() !== '' ? cat.iconUrl : undefined;
      if (!iconName && !iconUrl) {
        iconName = 'shape-outline';
      }
      return {
        id: cat.id,
        name: cat.name,
        iconName,
        iconUrl,
      };
    });
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { slug } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug || slugify(dto.name.toLowerCase().trim());
    const exists = await this.categoryRepo.findOne({ where: { slug } });
    if (exists) throw new BadRequestException('Slug already exists');

    const category = this.categoryRepo.create({
      name: dto.name,
      slug,
      iconUrl: dto.iconUrl,
      iconName: dto.iconName,
    });

    if (dto.parentId) {
      const parent = await this.categoryRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
      category.parent = parent;
    }

    return this.categoryRepo.save(category);
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.categoryRepo.findOneBy({ id });
    if (!category) throw new NotFoundException('Category not found');
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async findProductsByCategorySlug(slug: string): Promise<Product[]> {
    const category = await this.categoryRepo.findOne({
      where: { slug },
      relations: ['products', 'products.vendor'],
    });
    if (!category) throw new NotFoundException('Category not found');

    // Remove password field from vendor in each product (security)
    category.products.forEach(product => {
      if (product.vendor && 'password' in product.vendor) {
        delete (product.vendor as any).password;
      }
    });

    return category.products;
  }

  async delete(id: number): Promise<{ deleted: boolean }> {
    const count = await this.productRepo.count({ where: { category: { id } } });
    if (count > 0) {
      throw new BadRequestException('Cannot delete category in use by products');
    }

    const result = await this.categoryRepo.delete(id);
    return { deleted: (result.affected ?? 0) > 0 };
  }
}