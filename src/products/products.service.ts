import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from './entities/product.entity';
import { Tag } from '../tags/tag.entity';
import { User } from '../users/user.entity';
import { Order } from '../orders/order.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { plainToInstance } from 'class-transformer';
import { ProductResponseDto } from './dto/product-response.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
  ) {}

  async create(data: CreateProductDto & { vendorId: number }): Promise<Product> {
    const { tags = [], vendorId, ...rest } = data;

    const vendor = await this.userRepo.findOneBy({ id: vendorId });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const product = this.productRepo.create({ ...rest, vendor });

    if (tags.length) {
      product.tags = await this.assignTags(tags);
    }

    return this.productRepo.save(product);
  }

  async updateProduct(
    id: number,
    updateProductDto: UpdateProductDto & { tags?: string[] },
    user: any,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'tags'],
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only update your own products');
    }

    Object.assign(product, updateProductDto);

    if (updateProductDto.tags?.length) {
      product.tags = await this.assignTags(updateProductDto.tags);
    }

    return this.productRepo.save(product);
  }

  async deleteProduct(id: number, user: any): Promise<{ deleted: boolean }> {
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
      relations: ['vendor', 'tags'],
    });

    if (!product) return null;

    const dto = plainToInstance(ProductResponseDto, product, {
      excludeExtraneousValues: true,
    });
    dto.tags = product.tags?.map((t) => t.name) || [];
    return dto;
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
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.tags', 'tag');

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

    if (priceMin) {
      qb.andWhere('product.price >= :priceMin', { priceMin: parseFloat(priceMin) });
    }

    if (priceMax) {
      qb.andWhere('product.price <= :priceMax', { priceMax: parseFloat(priceMax) });
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

    const dtos = items.map((product) => {
      const dto = plainToInstance(ProductResponseDto, product, {
        excludeExtraneousValues: true,
      });
      dto.tags = product.tags?.map((t) => t.name) || [];
      return dto;
    });

    return {
      items: dtos,
      total,
      perPage,
      currentPage: page,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findAll(): Promise<Product[]> {
   return this.productRepo.find({
    relations: ['vendor', 'tags'],
    });
  }

  async findByVendorId(vendorId: number): Promise<Product[]> {
    return this.productRepo.find({
      where: { vendor: { id: vendorId } },
      relations: ['vendor', 'tags'],
    });
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
}  
