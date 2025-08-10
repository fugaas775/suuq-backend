import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { FindAllVendorsDto } from './dto/find-all-vendors.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Raw, ArrayContains, ILike } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Category } from '../categories/entities/category.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { Order } from '../orders/entities/order.entity';
import { UserRole } from '../auth/roles.enum';

@Injectable()
export class VendorService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,
  ) {}

  // ✅ FIX: This function now correctly handles an array of ImageDto objects
  async createMyProduct(userId: number, dto: CreateVendorProductDto): Promise<Product> {
    const vendor = await this.userRepository.findOneBy({ id: userId });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
    }

    const { images, categoryId, ...productData } = dto;

    const newProduct = this.productRepository.create({
      ...productData,
      vendor: vendor,
      category: categoryId ? { id: categoryId } : undefined,
      imageUrl: images && images.length > 0 ? images[0].src : null, // Set main display image
    });
    
    // 1. Save the main product to get its ID
    const savedProduct = await this.productRepository.save(newProduct);

    // 2. Create and save all associated image entities
    if (images && images.length > 0) {
      const imageEntities = images.map((imageObj, index) =>
        this.productImageRepository.create({
          src: imageObj.src,
          thumbnailSrc: imageObj.thumbnailSrc,
          lowResSrc: imageObj.lowResSrc,
          product: savedProduct, // Link to the product
          sortOrder: index,
        }),
      );
      await this.productImageRepository.save(imageEntities);
    }
    
    // 3. Return the full product with all its new relations
    return this.productRepository.findOneOrFail({
        where: { id: savedProduct.id },
        relations: ['images', 'vendor', 'category', 'tags']
    });
  }

  // ✅ FIX: This function is now type-safe and handles image updates
  async updateMyProduct(userId: number, productId: number, dto: UpdateVendorProductDto): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
    });
    if (!product) {
      throw new NotFoundException('Product not found or you do not own it.');
    }

    const { images, categoryId, ...productData } = dto;

    // Update simple fields
    Object.assign(product, productData);
    
    // Update category if it was sent
    if (categoryId !== undefined) {
      if (categoryId) {
        // Fetch the category entity from the database
        const categoryRepo = this.productRepository.manager.getRepository(Category);
        const category = await categoryRepo.findOne({ where: { id: categoryId } });
        if (!category) {
          throw new NotFoundException(`Category with ID ${categoryId} not found.`);
        }
        product.category = category;
      } else {
        product.category = null;
      }
    }

    // Update images if they were sent (delete old ones, add new ones)
    if (images) {
      product.imageUrl = images.length > 0 ? images[0].src : null;
      await this.productImageRepository.delete({ product: { id: productId } });

      const imageEntities = images.map((imageObj, index) => 
        this.productImageRepository.create({ ...imageObj, product, sortOrder: index })
      );
      await this.productImageRepository.save(imageEntities);
    }
    
    await this.productRepository.save(product);
    return this.productRepository.findOneOrFail({ where: { id: productId }, relations: ['images', 'vendor', 'category', 'tags']});
  }

  async deleteMyProduct(userId: number, productId: number): Promise<{ deleted: boolean }> {
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
    });
    if (!product) {
      throw new NotFoundException('Product not found or not owned by user');
    }
    await this.productRepository.delete(productId);
    return { deleted: true };
  }
  
  async getSalesGraphData(vendorId: number, range: string) {
    const startDate = new Date();
    if (range === '30d') startDate.setDate(startDate.getDate() - 30);
    else if (range === '7d') startDate.setDate(startDate.getDate() - 7);

    const salesData = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin('o.items', 'orderItem')
      .innerJoin('orderItem.product', 'product')
      .where('product.vendorId = :vendorId', { vendorId })
      .andWhere('o.createdAt >= :startDate', { startDate })
      .select('DATE(o.createdAt)', 'date')
      .addSelect('SUM(o.total)', 'total')
      .groupBy('DATE(o.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();
      
    return salesData.map(point => ({ ...point, total: parseFloat(point.total) || 0 }));
  }

  // Your other public and dashboard methods remain here...
  async findPublicVendors(
    findAllVendorsDto: FindAllVendorsDto & {
      sort?: 'name' | 'recent' | 'popular' | 'verifiedAt';
      verificationStatus?: 'APPROVED' | 'PENDING' | 'REJECTED';
      role?: 'VENDOR';
    },
  ): Promise<{ items: any[]; total: number; currentPage: number; totalPages: number }> {
    const { page = 1, limit = 10, search, sort = 'recent', verificationStatus } = findAllVendorsDto;
    const skip = (page - 1) * limit;

    let findOptions: any;

    if (search) {
      // If there is a search term, create OR conditions for displayName and storeName
      findOptions = {
        where: [
          {
            roles: ArrayContains([UserRole.VENDOR]),
            isActive: true,
            displayName: ILike(`%${search}%`),
          },
          {
            roles: ArrayContains([UserRole.VENDOR]),
            isActive: true,
            storeName: ILike(`%${search}%`),
          },
        ],
      };
    } else {
      // If there is no search term, find all vendors
      findOptions = {
        where: {
          roles: ArrayContains([UserRole.VENDOR]),
          isActive: true,
        },
      };
    }

    const order: any = {};
    if (sort === 'name') order.displayName = 'ASC';
    else if (sort === 'verifiedAt') order.verifiedAt = 'DESC';
    else if (sort === 'popular') order.numberOfSales = 'DESC';
    else order.createdAt = 'DESC';

    // filter by verificationStatus when provided (Home uses APPROVED)
    if (verificationStatus) {
      findOptions.where = Array.isArray(findOptions.where) ? findOptions.where.map((w: any) => ({
        ...w,
        verificationStatus,
      })) : { ...findOptions.where, verificationStatus };
    }

    const [users, total] = await this.userRepository.findAndCount({
      ...findOptions,
      take: limit,
      skip,
      order,
      select: [
        'id', 'displayName', 'storeName', 'avatarUrl', 'verificationStatus', 'verified',
        'rating', 'numberOfSales', 'verifiedAt', 'createdAt', 'supportedCurrencies', 'registrationCountry', 'registrationCity'
      ] as any,
    });

    const items = users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      storeName: u.storeName,
      avatarUrl: u.avatarUrl,
      verificationStatus: u.verificationStatus,
      isVerified: !!u.verified,
      rating: u.rating ?? 0,
      productCount: undefined, // placeholder; can join or compute later
      certificateCount: Array.isArray((u as any).verificationDocuments) ? (u as any).verificationDocuments.length : undefined,
    }));

    return {
      items,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    };
  }
  async getPublicProfile(userId: number) {
    // ... (Your existing code is preserved)
    const user = await this.userRepository.createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .andWhere(':role = ANY(user.roles)', { role: UserRole.VENDOR })
      .getOne();
    if (!user) return null;
    const { id, storeName, avatarUrl, displayName, createdAt } = user;
    return { id, storeName, avatarUrl, displayName, createdAt };
  }

  async getDashboardOverview(userId: number) {
    const productCount = await this.productRepository.count({
      where: { vendor: { id: userId } },
    });

    const orderCount = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'orderItem')
      .innerJoin('orderItem.product', 'product')
      .where('product.vendor.id = :userId', { userId })
      .getCount();

    return { productCount, orderCount };
  }
  async getVendorProducts(userId: number) {
    // Eagerly load product relations
    const products = await this.productRepository.find({
      where: { vendor: { id: userId } },
      relations: ['images', 'category', 'tags'],
    });
    return Array.isArray(products) ? products : [];
  }

  async getSales(vendorId: number) {
    const sales = await this.orderRepository.find({
      where: {
        items: {
          product: {
            vendor: {
              id: vendorId,
            },
          },
        },
      },
      relations: ['items', 'items.product', 'user'],
    });
    return sales;
  }
}