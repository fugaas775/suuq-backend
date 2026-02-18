import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('coupons')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createCoupon(@Body() body: CreateCouponDto) {
    return this.promotionsService.createCoupon({
      ...body,
      expiresAt: new Date(body.expiresAt),
    });
  }

  @Get('coupons')
  async getCoupons(@Query('vendorId') vendorId?: string) {
    return this.promotionsService.getCoupons(
      vendorId ? Number(vendorId) : undefined,
    );
  }

  @Post('coupons/validate')
  async validate(
    @Body() body: { code: string; amount: number; vendorId?: number },
  ) {
    return this.promotionsService.validateCoupon(
      body.code,
      body.amount,
      body.vendorId,
    );
  }

  @Get('flash-sales')
  async getFlashSales() {
    return this.promotionsService.getActiveFlashSales();
  }
}
