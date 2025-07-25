import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from './entities/product.entity';
import { CurrencyService } from '../common/services/currency.service';
import { Tag } from '../tags/tag.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductImage } from './entities/product-image.entity';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ProductImage) private productImageRepo: Repository<ProductImage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
    private readonly currencyService: CurrencyService,
  ) {}

  async create(data: CreateProductDto & { vendorId: number }): Promise<Product> {
    const { tags = [], images = [], vendorId, categoryId, ...rest } = data;

    const vendor = await this.userRepo.findOneBy({ id: vendorId });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    // --- THIS IS THE FIX ---
    // Use the vendor's currency, or fall back to a default ('USD') if it's not set.
    const productCurrency = vendor.currency || 'USD';
    if (!vendor.currency) {
        this.logger.warn(`Vendor with ID ${vendorId} has no currency set. Defaulting to USD.`);
    }

    const category = categoryId ? ({ id: categoryId } as any) : undefined;

    const product = this.productRepo.create({
      ...rest,
      vendor,
      category,
      currency: productCurrency, // Use the safe currency value
    });

    if (tags.length) {
      product.tags = await this.assignTags(tags);
    }

    const savedProduct = await this.productRepo.save(product);

    if (images.length) {
      const imageEntities = images.map((src, idx) =>
        this.productImageRepo.create({
          src,
          sortOrder: idx,
          product: savedProduct,
        }),
      );
      await this.productImageRepo.save(imageEntities);
    }
    
    // Return the full entity; the ClassSerializerInterceptor will format it.
    return this.findOne(savedProduct.id);
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'category', 'tags', 'images'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }
  
  async findFiltered(filters: ProductFilterDto): Promise<{
    items: Product[];
    total: number;
    perPage: number;
    currentPage: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      perPage = 10,
      search,
      categoryId,
      categorySlug,
      featured,
      sort,
      priceMin,
      priceMax,
      tags,
    } = filters;

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
      qb.innerJoin('product.tags', 'tagFilter', 'tagFilter.name IN (:...tagList)', { tagList });
    }
    if (priceMin !== undefined) {
      qb.andWhere('product.price >= :priceMin', { priceMin });
    }
    if (priceMax !== undefined) {
      qb.andWhere('product.price <= :priceMax', { priceMax });
    }

    // Default sorting
    qb.orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();
    
    return {
      items,
      total,
      perPage,
      currentPage: page,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async updateProduct(
    id: number,
    updateProductDto: UpdateProductDto & { tags?: string[]; images?: string[]; categoryId?: number },
    user: Pick<User, 'id'>,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only update your own products');
    }

    if (typeof updateProductDto.categoryId === 'number') {
      (product as any).category = { id: updateProductDto.categoryId };
    }

    Object.assign(product, updateProductDto);

    if (updateProductDto.tags) {
      product.tags = await this.assignTags(updateProductDto.tags);
    }

    if (updateProductDto.images) {
      await this.productImageRepo.delete({ product: { id: product.id } });
      const imageEntities = updateProductDto.images.map((src, idx) =>
        this.productImageRepo.create({ src, sortOrder: idx, product }),
      );
      await this.productImageRepo.save(imageEntities);
    }

    await this.productRepo.save(product);
    return this.findOne(id);
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

    const hasOrders = await this.orderRepo.count({ where: { items: { product: { id } } } });
    if (hasOrders > 0) {
      throw new BadRequestException('Cannot delete product with active orders');
    }

    await this.productRepo.delete(id);
    return { deleted: true };
  }

  async assignTags(tagNames: string[]): Promise<Tag[]> {
    const existingTags = await this.tagRepo.find({ where: { name: In(tagNames) } });
    const existingTagNames = existingTags.map((t) => t.name);
    const newTagNames = tagNames.filter((name) => !existingTagNames.includes(name));

    const newTags = this.tagRepo.create(newTagNames.map((name) => ({ name })));
    await this.tagRepo.save(newTags);

    return [...existingTags, ...newTags];
  }

  // Admin-specific methods
  async toggleBlockStatus(id: number, isBlocked: boolean): Promise<Product> {
    await this.productRepo.update(id, { isBlocked });
    return this.findOne(id);
  }

  async toggleFeatureStatus(id: number, featured: boolean): Promise<Product> {
    await this.productRepo.update(id, { featured });
    return this.findOne(id);
  }
  
  // Suggestion methods
  async suggestNames(query: string): Promise<{ name: string }[]> {
    return this.productRepo
      .createQueryBuilder('product')
      .select('product.name', 'name')
      .where('product.name ILIKE :q', { q: `%${query}%` })
      .limit(5)
      .getRawMany();
  }
}
