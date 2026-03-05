import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, DiscountType } from './entities/coupon.entity';
import { FlashSale } from './entities/flash-sale.entity';

@Injectable()
export class PromotionsService {
  private flashSalesCache: {
    expiresAt: number;
    payload: FlashSale[];
  } | null = null;

  constructor(
    @InjectRepository(Coupon)
    private couponRepo: Repository<Coupon>,
    @InjectRepository(FlashSale)
    private flashSaleRepo: Repository<FlashSale>,
  ) {}

  async createCoupon(data: Partial<Coupon>) {
    return this.couponRepo.save(this.couponRepo.create(data));
  }

  async getCoupons(vendorId?: number) {
    const where: any = {};
    if (vendorId) {
      where.vendor = { id: vendorId };
    }

    return this.couponRepo.find({
      where,
      relations: ['vendor'],
      order: { createdAt: 'DESC' },
    });
  }

  async validateCoupon(code: string, orderAmount: number, vendorId?: number) {
    const coupon = await this.couponRepo.findOne({
      where: { code, isActive: true },
      relations: ['vendor'],
    });

    if (!coupon) throw new NotFoundException('Coupon not found');
    if (coupon.expiresAt < new Date())
      throw new BadRequestException('Coupon expired');
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }
    if (orderAmount < coupon.minOrderAmount) {
      throw new BadRequestException(
        `Minimum order amount is ${coupon.minOrderAmount}`,
      );
    }
    if (coupon.vendor && vendorId && coupon.vendor.id !== vendorId) {
      throw new BadRequestException('Coupon not valid for this vendor');
    }

    let discount = 0;
    if (coupon.discountType === DiscountType.FIXED_AMOUNT) {
      discount = Number(coupon.amount);
    } else {
      discount = (orderAmount * Number(coupon.amount)) / 100;
    }

    return { isValid: true, discount, coupon };
  }

  async deleteCoupon(id: number) {
    const result = await this.couponRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Coupon not found');
    }
    return { deleted: true };
  }

  async incrementUsage(id: number) {
    await this.couponRepo.increment({ id }, 'usedCount', 1);
  }

  async createFlashSale(data: Partial<FlashSale>) {
    return this.flashSaleRepo.save(this.flashSaleRepo.create(data));
  }

  async getActiveFlashSales() {
    const nowMs = Date.now();
    if (this.flashSalesCache && this.flashSalesCache.expiresAt > nowMs) {
      return this.flashSalesCache.payload;
    }

    const now = new Date();
    const rows = await this.flashSaleRepo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.products', 'product')
      .where('sale.isActive = :isActive', { isActive: true })
      .andWhere('sale.startTime <= :now', { now })
      .andWhere('sale.endTime >= :now', { now })
      .orderBy('sale.endTime', 'ASC')
      .getMany();

    const ttlMs = Math.max(
      5000,
      Number(process.env.FLASH_SALES_CACHE_TTL_MS || 60000),
    );
    this.flashSalesCache = {
      expiresAt: nowMs + ttlMs,
      payload: rows,
    };

    return rows;
  }
}
