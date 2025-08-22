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
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductImage } from './entities/product-image.entity';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { Tag } from '../tags/tag.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ProductImage) private productImageRepo: Repository<ProductImage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
    @InjectRepository(require('../categories/entities/category.entity').Category) private categoryRepo: Repository<any>,
  ) {}

  // ✅ NEW create method
  async create(data: CreateProductDto & { vendorId: number }): Promise<Product> {
    const { tags = [], images = [], vendorId, categoryId, ...rest } = data;

    const vendor = await this.userRepo.findOneBy({ id: vendorId });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    let category = undefined;
    if (categoryId) {
      category = await this.categoryRepo.findOneBy({ id: categoryId });
      if (!category) throw new NotFoundException('Category not found');
    }
    const product = this.productRepo.create({
      ...rest,
      vendor,
      category,
      currency: rest.currency || vendor.currency || 'USD',
      imageUrl: images.length > 0 ? images[0].src : null,
    });

    if (tags.length) {
      product.tags = await this.assignTags(tags);
    }
    // 1. Save the main product first to get its ID
    const savedProduct = await this.productRepo.save(product);

    // 2. Create and save the associated ProductImage entities
    if (images.length > 0) {
      const imageEntities = images.map((imageObj, index) =>
        this.productImageRepo.create({
          src: imageObj.src,
          thumbnailSrc: imageObj.thumbnailSrc,
          lowResSrc: imageObj.lowResSrc,
          product: savedProduct, // Link to the saved product
          sortOrder: index,
        }),
      );
      await this.productImageRepo.save(imageEntities);
    }

    // 3. Return the product with all its relations
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
  const { page = 1, perPage = 20, search, categoryId, categorySlug, featured, tags, priceMin, priceMax, sort, country, region, city, geoPriority, userCountry, userRegion, userCity } = filters;

    const qb = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.tags', 'tag')
      .leftJoinAndSelect('product.images', 'images');

    // Only show published and not blocked products
    qb.andWhere('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false');

    if (search) qb.andWhere('product.name ILIKE :search', { search: `%${search}%` });
    if (categorySlug) qb.andWhere('category.slug = :categorySlug', { categorySlug });
    else if (categoryId) qb.andWhere('category.id = :categoryId', { categoryId });
    if (typeof featured === 'boolean') qb.andWhere('product.featured = :featured', { featured });
    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim());
      qb.innerJoin('product.tags', 'tagFilter', 'tagFilter.name IN (:...tagList)', { tagList });
    }
    if (priceMin !== undefined) qb.andWhere('product.price >= :priceMin', { priceMin });
    if (priceMax !== undefined) qb.andWhere('product.price <= :priceMax', { priceMax });

    // Geo handling
    // If geoPriority mode is enabled, we DO NOT hard filter; we rank by proximity of vendor profile fields to user provided geo.
    // Otherwise, we apply strict filters if supplied.
    let addedGeoRank = false;
    if (geoPriority) {
      // Normalize inputs to lowercase for comparison
      const eaList = (filters as any).eastAfrica ? String((filters as any).eastAfrica).split(',').map((c: string) => c.trim().toUpperCase()) : ['ET','SO','KE','DJ'];
      const uc = (userCountry || country || '').toLowerCase();
      const ur = (userRegion || region || '').toLowerCase();
      const uci = (userCity || city || '').toLowerCase();
      // Build a CASE expression for geo rank: 4 city match, 3 region match, 2 country match, 1 in East Africa list, else 0
      const eastAfricaSqlList = eaList.map(c => `'${c}'`).join(',');
      const geoRankExpr = `CASE 
        WHEN ${uci ? `LOWER(vendor."registrationCity") = '${uci}'` : '1=0'} THEN 4
        WHEN ${ur ? `LOWER(vendor."registrationRegion") = '${ur}'` : '1=0'} THEN 3
        WHEN ${uc ? `LOWER(vendor."registrationCountry") = '${uc}'` : '1=0'} THEN 2
        WHEN UPPER(COALESCE(vendor."registrationCountry", '')) IN (${eastAfricaSqlList}) THEN 1
        ELSE 0 END`;
      qb.addSelect(geoRankExpr, 'geo_rank');
      addedGeoRank = true;
    } else {
      if (country) qb.andWhere('LOWER(vendor.registrationCountry) = LOWER(:country)', { country });
      if (region) qb.andWhere('LOWER(vendor.registrationRegion) = LOWER(:region)', { region });
      if (city) qb.andWhere('LOWER(vendor.registrationCity) = LOWER(:city)', { city });
    }

    // Sorting options
    // Default: newest first
    if (!sort || sort === 'created_desc' || sort === '') {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.createdAt', 'DESC');
    } else if (sort === 'price_asc') {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.price', 'ASC', 'NULLS LAST');
    } else if (sort === 'price_desc') {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.price', 'DESC', 'NULLS LAST');
    } else if (sort === 'rating_desc') {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
        .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
        .addOrderBy('product.createdAt', 'DESC');
    } else if (sort === 'sales_desc') {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST')
        .addOrderBy('product.createdAt', 'DESC');
    } else {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.createdAt', 'DESC');
    }

    qb.skip((page - 1) * perPage).take(perPage);
    const [items, total] = await qb.getManyAndCount();
    
    return { items, total, perPage, currentPage: page, totalPages: Math.ceil(total / perPage) };
  }

  // Basic recommendation strategy: 
  // - If user has reviews, prioritize products in same categories/tags
  // - Else, return featured + top-rated mix
  async recommendedForUser(userId: number, page = 1, perPage = 20): Promise<{ items: Product[]; total: number; perPage: number; currentPage: number; totalPages: number }> {
    // Get categories from user's reviews
    const reviewed = await this.productRepo.createQueryBuilder('p')
      .innerJoin('p.reviews', 'r', 'r.userId = :userId', { userId })
      .leftJoin('p.category', 'c')
      .leftJoin('p.tags', 't')
      .select(['p.id', 'c.id', 't.id'])
      .limit(200)
      .getMany();

    const categoryIds = Array.from(new Set(reviewed.map(p => p.category?.id).filter(Boolean) as number[]));
    // We won’t extract tag IDs here deeply; keep it simple

    const qb = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.tags', 'tag')
      .leftJoinAndSelect('product.images', 'images');

    if (categoryIds.length) {
      qb.andWhere('category.id IN (:...categoryIds)', { categoryIds });
    } else {
      qb.andWhere('(product.featured = true OR product.average_rating IS NOT NULL)');
    }

    qb.orderBy('product.average_rating', 'DESC', 'NULLS LAST')
      .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
      .addOrderBy('product.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, perPage, currentPage: page, totalPages: Math.ceil(total / perPage) };
  }

  // ✅ NEW updateProduct method
  async updateProduct(id: number, updateData: UpdateProductDto, user: User): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only update your own products.');
    }

    const { tags, images, categoryId, ...rest } = updateData;
    // Update simple properties
    Object.assign(product, rest);

    // Update category if provided
    if (categoryId !== undefined) {
      if (categoryId) {
        const category = await this.categoryRepo.findOneBy({ id: categoryId });
        if (!category) throw new NotFoundException('Category not found');
        product.category = category;
      } else {
        product.category = null;
      }
    }

    // Update tags if provided
    if (tags) {
      product.tags = await this.assignTags(tags);
    }

    // Update images if provided: delete old ones, add new ones
    if (images) {
      product.imageUrl = images.length > 0 ? images[0].src : null;
      await this.productImageRepo.delete({ product: { id } }); // Delete old images
      const imageEntities = images.map((img, index) => 
        this.productImageRepo.create({ ...img, product, sortOrder: index })
      );
      await this.productImageRepo.save(imageEntities); // Save new images
    }

    await this.productRepo.save(product);
    return this.findOne(id);
  }

  async deleteProduct(id: number, user: Pick<User, 'id'>): Promise<{ deleted: boolean }> {
    const product = await this.productRepo.findOne({ where: { id }, relations: ['vendor'] });
    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id !== user.id) throw new ForbiddenException('You can only delete your own products');
    const hasOrders = await this.orderRepo.count({ where: { items: { product: { id } } } });
    if (hasOrders > 0) throw new BadRequestException('Cannot delete product with active orders');
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

  // ✨ FIX: ADDED MISSING METHODS
  
  async toggleBlockStatus(id: number, isBlocked: boolean): Promise<Product> {
    await this.productRepo.update(id, { isBlocked });
    return this.findOne(id);
  }

  async toggleFeatureStatus(id: number, featured: boolean): Promise<Product> {
    await this.productRepo.update(id, { featured });
    return this.findOne(id);
  }
  
  async suggestNames(query: string): Promise<{ name: string }[]> {
    return this.productRepo
      .createQueryBuilder('product')
      .select('product.name', 'name')
      .where('product.name ILIKE :q', { q: `%${query}%` })
      .distinct(true)
      .limit(10)
      .getRawMany();
  }
}