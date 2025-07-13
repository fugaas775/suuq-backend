import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { CartService } from './cart.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Req() req: AuthenticatedRequest) {
    return this.cartService.getCart(req.user!.id);
  }

  @Post('items')
  addItem(@Req() req: AuthenticatedRequest, @Body() addToCartDto: AddToCartDto) {
    return this.cartService.addItem(req.user!.id, addToCartDto.productId, addToCartDto.quantity);
  }

  @Put('items/:productId')
  updateItemQuantity(
    @Req() req: AuthenticatedRequest,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemQuantity(req.user!.id, productId, updateCartItemDto.quantity);
  }

  @Delete('items/:productId')
  removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.cartService.removeItem(req.user!.id, productId);
  }

  @Delete()
  clearCart(@Req() req: AuthenticatedRequest) {
    return this.cartService.clearCart(req.user!.id);
  }
}