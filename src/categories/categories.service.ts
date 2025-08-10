import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TreeRepository, Repository, IsNull } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from 'transliteration';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: TreeRepository<Category>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findRoots(): Promise<Category[]> {
    return this.categoryRepo.find({
      where: { parent: IsNull() },
      relations: ['children'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  // This method now returns the full Category entity.
  // The ClassSerializerInterceptor in the controller will handle the response format.
  async findAll(perPage?: number): Promise<Category[]> {
    return this.categoryRepo.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
      take: perPage && perPage > 0 ? perPage : undefined,
      relations: ['parent'],
    });
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['parent'],
    });
    if (!category) throw new NotFoundException(`Category with ID ${id} not found`);
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name.toLowerCase().trim());
    const exists = await this.categoryRepo.findOne({ where: { slug } });
    if (exists) {
      throw new BadRequestException(`Slug already exists for category: '${exists.name}'`);
    }

    const category = this.categoryRepo.create({
      name: dto.name,
      slug,
      iconUrl: dto.iconUrl,
      iconName: dto.iconName,
      sortOrder: dto.sortOrder,
    });

    if (dto.parentId) {
      const parent = await this.findOne(dto.parentId);
      if (parent.parent) {
        throw new BadRequestException('A category cannot be a sub-category of another sub-category.');
      }
      category.parent = parent;
    }

    return this.categoryRepo.save(category);
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (dto.slug && dto.slug !== category.slug) {
      const exists = await this.categoryRepo.findOne({ where: { slug: dto.slug } });
      if (exists) throw new BadRequestException('Slug already exists');
    }

    if (dto.parentId === null) {
      category.parent = null;
    } else if (dto.parentId) {
      const parent = await this.findOne(dto.parentId);
      if (parent.parent) {
        throw new BadRequestException('A category cannot be a sub-category of another sub-category.');
      }
      category.parent = parent;
    }

    const updatedCategory = this.categoryRepo.merge(category, dto);

    return this.categoryRepo.save(updatedCategory);
  }

  async delete(id: number): Promise<{ deleted: boolean }> {
    const productCount = await this.productRepo.count({ where: { category: { id } } });
    if (productCount > 0) {
      throw new BadRequestException('Cannot delete category because it is linked to existing products.');
    }
    
    const category = await this.findOne(id);
    const childrenCount = await this.categoryRepo.countDescendants(category);
    if (childrenCount > 1) {
      throw new BadRequestException('Cannot delete a category that has sub-categories. Please delete them first.');
    }

    const result = await this.categoryRepo.delete(id);
    return { deleted: (result.affected ?? 0) > 0 };
  }
}
