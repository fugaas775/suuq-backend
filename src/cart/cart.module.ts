import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { Cart, CartItem } from './entities/cart.entity';
import { Product } from '../products/entities/product.entity';
import { AuthModule } from '../auth/auth.module'; // Import AuthModule if needed

@Module({
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, Product]),
    AuthModule, // Include if your AuthGuard is provided here
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}