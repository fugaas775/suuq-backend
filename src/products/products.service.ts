import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from './entities/product.entity';
import { Tag } from '../tags/tag.entity';
import { User } from '../users/entities/user.entity'; 
import { Order } from '../orders/entities/order.entity'; 
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { ProductImage } from './entities/product-image.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ProductImage) private productImageRepo: Repository<ProductImage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
  ) {}

  async create(data: CreateProductDto & { vendorId: number }): Promise<ProductResponseDto> {
    const {
      tags = [],
      images = [],
      vendorId,
      categoryId,
      ...rest
    } = data;

    const vendor = await this.userRepo.findOneBy({ id: vendorId });
    if (!vendor) throw new NotFoundException('Vendor not found');

    let category = undefined;
    if (categoryId) {
      // If categoryId is provided, set the relation
      category = { id: categoryId } as any;
    }

    // rest now includes sku, stock_quantity, manage_stock, status, etc.
    const product = this.productRepo.create({
      ...rest,
      vendor,
      category,
    });

    if (tags.length) {
      product.tags = await this.assignTags(tags);
    }

    // Save product to get ID
    const savedProduct = await this.productRepo.save(product);

    // Handle images
    if (images.length) {
      const imageEntities = images.map((src, idx) =>
        this.productImageRepo.create({
          src,
          sortOrder: idx,
          product: savedProduct,
        }),
      );
      await this.productImageRepo.save(imageEntities);
      savedProduct.images = imageEntities;
    } else {
      savedProduct.images = [];
    }

    return this.mapProductToDto(
      await this.productRepo.findOneOrFail({
        where: { id: savedProduct.id },
        relations: ['vendor', 'category', 'tags', 'images'],
      }),
    );
  }

  async updateProduct(
    id: number,
    updateProductDto: UpdateProductDto & { tags?: string[]; images?: string[]; categoryId?: number },
    user: Pick<User, 'id'>,
  ): Promise<ProductResponseDto> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'tags', 'images', 'category'],
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only update your own products');
    }

    // If categoryId is present, update the relation
    if (typeof updateProductDto.categoryId === 'number') {
      (product as any).category = { id: updateProductDto.categoryId };
    }

    // Object.assign will now include sku, stock_quantity, manage_stock, status, etc.
    Object.assign(product, updateProductDto);

    // Update tags if provided
    if (updateProductDto.tags?.length) {
      product.tags = await this.assignTags(updateProductDto.tags);
    }

    // Update images if provided
    if (updateProductDto.images) {
      // Remove old images
      await this.productImageRepo.delete({ product: { id: product.id } });
      // Add new images
      const imageEntities = updateProductDto.images.map((src, idx) =>
        this.productImageRepo.create({
          src,
          sortOrder: idx,
          product: product,
        }),
      );
      await this.productImageRepo.save(imageEntities);
      product.images = imageEntities;
    }

    const saved = await this.productRepo.save(product);

    return this.mapProductToDto(
      await this.productRepo.findOneOrFail({
        where: { id: saved.id },
        relations: ['vendor', 'category', 'tags', 'images'],
      }),
    );
  }

  async deleteProduct(id: number, user: Pick<User, 'id'>): Promise<{ deleted: boolean }> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only delete your own products');
    }

    const hasOrders = await this.orderRepo.count({ where: { productId: id } });
    if (hasOrders > 0) {
      throw new BadRequestException('Cannot delete product with active orders');
    }

    await this.productRepo.delete(id);
    return { deleted: true };
  }

  async findOne(id: number): Promise<ProductResponseDto | null> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'category', 'tags', 'images'],
    });

    if (!product) return null;

    return this.mapProductToDto(product);
  }

  async findFiltered({
    perPage = 10,
    page = 1,
    search,
    categoryId,
    categorySlug,
    featured,
    sort,
    priceMin,
    priceMax,
    tags,
  }: {
    perPage?: number;
    page?: number;
    search?: string;
    categoryId?: number;
    categorySlug?: string;
    featured?: boolean;
    sort?: string;
    priceMin?: string;
    priceMax?: string;
    tags?: string;
  }): Promise<{
    items: ProductResponseDto[];
    total: number;
    perPage: number;
    currentPage: number;
    totalPages: number;
  }> {
    try {
      this.logger.debug('findFiltered params: ' + JSON.stringify({
        perPage, page, search, categoryId, categorySlug, featured, sort, priceMin, priceMax, tags
      }));

      const qb = this.productRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.vendor', 'vendor')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.tags', 'tag')
        .leftJoinAndSelect('product.images', 'images');

      if (search) {
        qb.andWhere('product.name ILIKE :search', { search: `%${search}%` });
      }

      if (categorySlug) {
        qb.andWhere('category.slug = :categorySlug', { categorySlug });
      } else if (categoryId) {
        qb.andWhere('category.id = :categoryId', { categoryId });
      }

      if (typeof featured === 'boolean') {
        qb.andWhere('product.featured = :featured', { featured });
      }

      if (tags) {
        const tagList = tags.split(',').map((t) => t.trim());
        qb.innerJoin('product.tags', 'tagFilter', 'tagFilter.name IN (:...tagList)', {
          tagList,
        });
      }

      // Defensive: check if priceMin/priceMax are numbers before filtering
      const minVal = priceMin ? parseFloat(priceMin) : undefined;
      if (minVal !== undefined && !isNaN(minVal)) {
        qb.andWhere('product.price >= :priceMin', { priceMin: minVal });
      }

      const maxVal = priceMax ? parseFloat(priceMax) : undefined;
      if (maxVal !== undefined && !isNaN(maxVal)) {
        qb.andWhere('product.price <= :priceMax', { priceMax: maxVal });
      }

      let orderByField: keyof Product = 'createdAt';
      let orderDirection: 'ASC' | 'DESC' = 'DESC';

      switch (sort) {
        case 'price_asc':
          orderByField = 'price';
          orderDirection = 'ASC';
          break;
        case 'price_desc':
          orderByField = 'price';
          orderDirection = 'DESC';
          break;
        case 'name_asc':
          orderByField = 'name';
          orderDirection = 'ASC';
          break;
        case 'name_desc':
          orderByField = 'name';
          orderDirection = 'DESC';
          break;
      }

      qb.orderBy(`product.${orderByField}`, orderDirection)
        .skip((page - 1) * perPage)
        .take(perPage);

      const [items, total] = await qb.getManyAndCount();

      const dtos = Array.isArray(items) ? items.map((product) => this.mapProductToDto(product)) : [];

      return {
        items: dtos,
        total,
        perPage,
        currentPage: page,
        totalPages: Math.ceil(total / perPage),
      };
    } catch (err) {
      this.logger.error('findFiltered error: ' + err?.toString());
      throw err;
    }
  }

  async findAll(): Promise<ProductResponseDto[]> {
    const products = await this.productRepo.find({
      relations: ['vendor', 'category', 'tags', 'images'],
    });
    return products.map((product) => this.mapProductToDto(product));
  }

  async findByVendorId(vendorId: number): Promise<ProductResponseDto[]> {
    const products = await this.productRepo.find({
      where: { vendor: { id: vendorId } },
      relations: ['vendor', 'category', 'tags', 'images'],
    });
    return products.map((product) => this.mapProductToDto(product));
  }

  async suggestNames(query: string): Promise<{ name: string }[]> {
    return this.productRepo
      .createQueryBuilder('product')
      .select(['product.name'])
      .where('product.name ILIKE :q', { q: `%${query}%` })
      .limit(5)
      .getRawMany();
  }

  async assignTags(tagNames: string[]): Promise<Tag[]> {
    const existingTags = await this.tagRepo.find({
      where: { name: In(tagNames) },
    });

    const existingTagNames = existingTags.map((t) => t.name);
    const newTagNames = tagNames.filter(
      (name) => !existingTagNames.includes(name),
    );

    const newTags = this.tagRepo.create(newTagNames.map((name) => ({ name })));
    await this.tagRepo.save(newTags);

    return [...existingTags, ...newTags];
  }

  async toggleBlockStatus(id: number, isBlocked: boolean): Promise<ProductResponseDto> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    product.isBlocked = isBlocked;
    const saved = await this.productRepo.save(product);

    return this.mapProductToDto(
      await this.productRepo.findOneOrFail({
        where: { id: saved.id },
        relations: ['vendor', 'category', 'tags', 'images'],
      }),
    );
  }

  async toggleFeatureStatus(id: number, featured: boolean): Promise<ProductResponseDto> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    product.featured = featured;
    const saved = await this.productRepo.save(product);

    return this.mapProductToDto(
      await this.productRepo.findOneOrFail({
        where: { id: saved.id },
        relations: ['vendor', 'category', 'tags', 'images'],
      }),
    );
  }

  private mapProductToDto(product: Product): ProductResponseDto {
    return {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      sale_price: product.sale_price ? Number(product.sale_price) : undefined,
      currency: product.currency,
      images: product.images?.map(img => ({ src: img.src })) || [],
      imageUrl: product.images?.length > 0 ? product.images[0].src : undefined,
      description: product.description,
      createdAt: product.createdAt,
      featured: product.featured,
      vendor: {
        id: product.vendor?.id,
        email: product.vendor?.email,
        displayName: product.vendor?.displayName,
        avatarUrl: product.vendor?.avatarUrl,
        store_name: product.vendor?.storeName,
        name: product.vendor?.displayName || product.vendor?.storeName,
      },
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name,
          }
        : undefined,
      tags: product.tags?.map((t) => t.name) || [],
      average_rating: product.average_rating ? Number(product.average_rating) : undefined,
      rating_count: product.rating_count,
      sku: product.sku,
      stock_quantity: product.stock_quantity,
      manage_stock: product.manage_stock,
      status: product.status,
    };
  }
}