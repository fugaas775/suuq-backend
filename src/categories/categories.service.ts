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
import { ILike } from 'typeorm';
import { repoCacheTTL } from '../common/utils/db-cache.util';
import { translateEntities } from '../common/utils/translation.util';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: TreeRepository<Category>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findByName(name: string): Promise<Category | null> {
    const ttl = repoCacheTTL();
    return this.categoryRepo.findOne({
      where: { name: ILike(name.trim()) },
      ...(ttl
        ? {
            cache: {
              id: `categories:name:${slugify(name)}`,
              milliseconds: ttl,
            },
          }
        : {}),
    });
  }

  async findRoots(): Promise<Category[]> {
    const ttl = repoCacheTTL();
    return this.categoryRepo.find({
      where: { parent: IsNull() },
      relations: ['children'],
      order: { sortOrder: 'ASC', name: 'ASC' },
      ...(ttl
        ? { cache: { id: 'categories:roots:v1', milliseconds: ttl } }
        : {}),
    });
  }

  // This method now returns the full Category entity.
  // The ClassSerializerInterceptor in the controller will handle the response format.
  async findAll(perPage?: number, lang: string = 'en'): Promise<Category[]> {
    const categories = await this.categoryRepo.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
      take: perPage && perPage > 0 ? perPage : undefined,
      relations: ['parent'],
    });

    return translateEntities(categories, lang, { name: 'nameTranslations' });
  }

  async suggest(
    q: string,
    limit: number,
  ): Promise<
    Array<{ id: number; name: string; slug: string; parentId: number | null }>
  > {
    const term = (q || '').trim();
    const take = Math.min(Math.max(Number(limit) || 10, 1), 50);

    const where = term
      ? [{ name: ILike(`%${term}%`) }, { slug: ILike(`%${term}%`) }]
      : {};
    const ttl = repoCacheTTL();
    const cats = await this.categoryRepo.find({
      where,
      take,
      order: { name: 'ASC' },
      ...(ttl
        ? {
            cache: {
              id: `categories:suggest:${term}:${take}`,
              milliseconds: Math.min(ttl, 15000),
            },
          }
        : {}),
    });
    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parent ? c.parent.id : null,
    }));
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['parent'],
    });
    if (!category)
      throw new NotFoundException(`Category with ID ${id} not found`);
    return category;
  }

  /** Find a category by slug or return null */
  async findBySlug(slug: string): Promise<Category | null> {
    return this.categoryRepo.findOne({
      where: { slug },
      relations: ['parent'],
    });
  }

  /** Find a category by slug with its descendants tree */
  async findDescendantsBySlug(slug: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { slug } });
    if (!category) throw new NotFoundException(`Category '${slug}' not found`);
    const tree = await this.categoryRepo.findDescendantsTree(category, {
      relations: ['children'],
      depth: 2, // limit depth for safety; adjust if needed
    });
    return tree;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug
      ? slugify(dto.slug)
      : slugify(dto.name.toLowerCase().trim());
    const exists = await this.categoryRepo.findOne({ where: { slug } });
    if (exists) {
      throw new BadRequestException(
        `Slug already exists for category: '${exists.name}'`,
      );
    }

    const iconUrl = dto.iconUrl;
    const createdAt = new Date();
    const category = this.categoryRepo.create({
      name: dto.name,
      slug,
      iconUrl,
      iconName: dto.iconName,
      sortOrder: dto.sortOrder,
      nameTranslations: dto.nameTranslations, // <-- Added translation map
      iconVersion: 0,
    });

    if (dto.parentId) {
      const parent = await this.findOne(dto.parentId);
      if (parent.parent) {
        throw new BadRequestException(
          'A category cannot be a sub-category of another sub-category.',
        );
      }
      category.parent = parent;
    }

    const saved = await this.categoryRepo.save(category);
    // If iconUrl exists, append version param for cache-busting
    if (saved.iconUrl) {
      saved.iconUrl = this.appendIconVersion(
        saved.iconUrl,
        saved.iconVersion,
        saved.updatedAt ?? createdAt,
      );
      await this.categoryRepo.save(saved);
    }
    return saved;
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    // Normalize slug if provided to keep consistency with create()
    const normalizedSlug = dto.slug ? slugify(dto.slug) : undefined;

    if (normalizedSlug && normalizedSlug !== category.slug) {
      const exists = await this.categoryRepo.findOne({
        where: { slug: normalizedSlug },
      });
      if (exists) throw new BadRequestException('Slug already exists');
    }

    if (dto.parentId === null) {
      category.parent = null;
    } else if (dto.parentId) {
      const parent = await this.findOne(dto.parentId);
      if (parent.parent) {
        throw new BadRequestException(
          'A category cannot be a sub-category of another sub-category.',
        );
      }
      category.parent = parent;
    }

    const wasIconChanged =
      (typeof dto.iconName !== 'undefined' &&
        dto.iconName !== category.iconName) ||
      (typeof dto.iconUrl !== 'undefined' && dto.iconUrl !== category.iconUrl);

    const updatedCategory = this.categoryRepo.merge(category, {
      ...dto,
      ...(typeof normalizedSlug !== 'undefined'
        ? { slug: normalizedSlug }
        : {}),
    });

    if (wasIconChanged) {
      updatedCategory.iconVersion = (updatedCategory.iconVersion || 0) + 1;
    }

    const saved = await this.categoryRepo.save(updatedCategory);
    if (wasIconChanged && saved.iconUrl) {
      saved.iconUrl = this.appendIconVersion(
        saved.iconUrl,
        saved.iconVersion,
        saved.updatedAt,
      );
      return this.categoryRepo.save(saved);
    }
    return saved;
  }

  async delete(id: number): Promise<{ deleted: boolean }> {
    const productCount = await this.productRepo.count({
      where: { category: { id } },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        'Cannot delete category because it is linked to existing products.',
      );
    }

    const category = await this.findOne(id);
    const childrenCount = await this.categoryRepo.countDescendants(category);
    if (childrenCount > 1) {
      throw new BadRequestException(
        'Cannot delete a category that has sub-categories. Please delete them first.',
      );
    }

    const result = await this.categoryRepo.delete(id);
    return { deleted: (result.affected ?? 0) > 0 };
  }

  // Append cache-busting version to icon URL using iconVersion or updatedAt timestamp
  private appendIconVersion(
    url: string,
    iconVersion?: number,
    updatedAt?: Date,
  ): string {
    const ver =
      typeof iconVersion === 'number'
        ? iconVersion
        : updatedAt
          ? updatedAt.getTime()
          : Date.now();
    const hasQuery = url.includes('?');
    const sep = hasQuery ? '&' : '?';
    // If already has v= param, replace it
    if (url.match(/[?&]v=\d+/)) {
      return url.replace(/([?&]v=)\d+/, `$1${ver}`);
    }
    return `${url}${sep}v=${ver}`;
  }
}

// Helper to append version param
function hasQuery(url: string): boolean {
  return url.includes('?');
}

export function appendQuery(
  url: string,
  key: string,
  value: string | number,
): string {
  const sep = hasQuery(url) ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}
