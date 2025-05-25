// src/products/products.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { UpdateProductDto } from './dto/update-product.dto';
import { Order } from '../orders/order.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Order) private orderRepo: Repository<Order>
  ) {}

  async updateProduct(id: number, updateProductDto: UpdateProductDto, user: any): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id }, relations: ['vendor'] });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only update your own products');
    }
    Object.assign(product, updateProductDto);
    return this.productRepo.save(product);
  }
  
  async create(data: Partial<Product>) {
    const product = this.productRepo.create(data);
    return this.productRepo.save(product);
  }


  async findAll(): Promise<Product[]> {
    return this.productRepo.find({ relations: ['vendor'] });
  }

  async findByVendorId(vendorId: number): Promise<Product[]> {
    return this.productRepo.find({
      where: { vendor: { id: vendorId } },
      relations: ['vendor'],
    });
  }

  async findFiltered({
  featured,
  perPage,
  page,
  categoryId,
  search,
  orderby,
}: {
  featured?: boolean;
  perPage: number;
  page: number;
  categoryId?: number;
  search?: string;
  orderby?: string;
}): Promise<Product[]> {
  const qb = this.productRepo.createQueryBuilder('product')
    .leftJoinAndSelect('product.vendor', 'vendor');

  if (featured !== undefined) {
    qb.andWhere('product.featured = :featured', { featured });
  }

  if (categoryId) {
    qb.andWhere('product.categoryId = :categoryId', { categoryId });
  }

  if (search) {
    qb.andWhere('product.name ILIKE :search', { search: `%${search}%` });
  }

  // Order by field
  if (orderby === 'date') {
    qb.orderBy('product.createdAt', 'DESC');
  } else if (orderby === 'price') {
    qb.orderBy('product.price', 'ASC');
  } else {
    qb.orderBy('product.createdAt', 'DESC');
  }

  // Pagination
  qb.take(perPage);
  qb.skip((page - 1) * perPage);

  return qb.getMany();
}


  async findOne(id: number): Promise<Product | null> {
    return this.productRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });
  }

  async deleteProduct(id: number, user: any): Promise<{ deleted: boolean }> {
    const product = await this.productRepo.findOne({ where: { id }, relations: ['vendor'] });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
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
}
