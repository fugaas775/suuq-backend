import { Controller, Get, Post, Body, UseGuards, Request, Put } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { SyncCartDto, AddToCartDto, UpdateQuantityDto } from './dto/cart.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  // FIX: Added 'any' type to req
  @Get()
  async getCart(@Request() req: any) {
    return this.cartService.findCartForUser(req.user);
  }

  // FIX: Added 'any' type to req
  @Post('sync')
  async syncCart(@Request() req: any, @Body() syncCartDto: SyncCartDto) {
    return this.cartService.syncCart(req.user, syncCartDto);
  }

  // FIX: Added 'any' type to req
  @Post('add')
  async addItem(@Request() req: any, @Body() addToCartDto: AddToCartDto) {
    return this.cartService.addItem(req.user, addToCartDto.productId, addToCartDto.quantity);
  }
  
  // FIX: Added 'any' type to req
  @Put('update')
  async updateQuantity(@Request() req: any, @Body() updateQuantityDto: UpdateQuantityDto) {
    return this.cartService.updateQuantity(req.user, updateQuantityDto.productId, updateQuantityDto.quantity);
  }

  // FIX: Added 'any' type to req
  @Post('remove')
  async removeItem(@Request() req: any, @Body('productId') productId: number) {
      return this.cartService.removeItem(req.user, productId);
  }

  // FIX: Added 'any' type to req
  @Post('clear')
  async clearCart(@Request() req: any) {
    return this.cartService.clearCart(req.user);
  }
}