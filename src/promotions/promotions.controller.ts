import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  ValidationPipe,
  UsePipes,
  Delete,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('coupons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createCoupon(@Body() body: CreateCouponDto) {
    return this.promotionsService.createCoupon({
      ...body,
      expiresAt: new Date(body.expiresAt),
    });
  }

  @Delete('coupons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  async deleteCoupon(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.deleteCoupon(id);
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
