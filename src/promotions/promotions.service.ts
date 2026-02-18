/* eslint-disable @typescript-eslint/no-unsafe-assignment */

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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

  async incrementUsage(id: number) {
    await this.couponRepo.increment({ id }, 'usedCount', 1);
  }

  async createFlashSale(data: Partial<FlashSale>) {
    return this.flashSaleRepo.save(this.flashSaleRepo.create(data));
  }

  async getActiveFlashSales() {
    const now = new Date();
    return this.flashSaleRepo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.products', 'product')
      .where('sale.isActive = :isActive', { isActive: true })
      .andWhere('sale.startTime <= :now', { now })
      .andWhere('sale.endTime >= :now', { now })
      .getMany();
  }
}
