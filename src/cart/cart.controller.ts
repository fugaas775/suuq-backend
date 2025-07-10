import { Controller, Get, Post, Body, UseGuards, Request, Put, Delete, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { SyncCartDto, AddToCartDto, UpdateQuantityDto } from './dto/cart.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@Request() req: any) {
    return this.cartService.findCartForUser(req.user);
  }

  @Post('sync')
  async syncCart(@Request() req: any, @Body() syncCartDto: SyncCartDto) {
    return this.cartService.syncCart(req.user, syncCartDto);
  }

  // RESTful: Add item
  @Post('items')
  async addItem(@Request() req: any, @Body() addToCartDto: AddToCartDto) {
    return this.cartService.addItem(req.user, addToCartDto.productId, addToCartDto.quantity);
  }

  // RESTful: Update quantity
  @Put('items/:productId')
  async updateQuantity(
    @Request() req: any,
    @Param('productId') productId: number,
    @Body() updateQuantityDto: UpdateQuantityDto
  ) {
    return this.cartService.updateQuantity(req.user, Number(productId), updateQuantityDto.quantity);
  }

  // RESTful: Remove item
  @Delete('items/:productId')
  async removeItem(@Request() req: any, @Param('productId') productId: number) {
    return this.cartService.removeItem(req.user, Number(productId));
  }

  // RESTful: Clear cart
  @Delete()
  async clearCart(@Request() req: any) {
    return this.cartService.clearCart(req.user);
  }
}