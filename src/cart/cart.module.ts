import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart, CartItem } from './entities/cart.entity';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, Product]),
  ],
  providers: [CartService],
  controllers: [CartController],
})
export class CartModule {}