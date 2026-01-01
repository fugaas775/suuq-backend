import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
  Query,
  Logger,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  private readonly logger = new Logger(CartController.name);

  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(
    @Req() req: AuthenticatedRequest,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Cart get: requestedCurrency=${currency}`);
    return this.cartService.getCart(req.user.id, currency);
  }

  @Post('items')
  addItem(
    @Req() req: AuthenticatedRequest,
    @Body() addToCartDto: AddToCartDto,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Cart addItem: requestedCurrency=${currency}`);
    return this.cartService.addItem(
      req.user.id,
      addToCartDto.productId,
      addToCartDto.quantity,
      currency,
    );
  }

  @Put('items/:productId')
  updateItemQuantity(
    @Req() req: AuthenticatedRequest,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() updateCartItemDto: UpdateCartItemDto,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Cart updateItem: requestedCurrency=${currency}`);
    return this.cartService.updateItemQuantity(
      req.user.id,
      productId,
      updateCartItemDto.quantity,
      currency,
    );
  }

  @Delete('items/:productId')
  removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('productId', ParseIntPipe) productId: number,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Cart removeItem: requestedCurrency=${currency}`);
    return this.cartService.removeItem(req.user.id, productId, currency);
  }

  @Delete()
  clearCart(
    @Req() req: AuthenticatedRequest,
    @Query('currency') currency?: string,
  ) {
    this.logger.debug(`Cart clear: requestedCurrency=${currency}`);
    return this.cartService.clearCart(req.user.id, currency);
  }
}
