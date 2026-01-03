import { forwardRef, Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { WalletModule } from '../wallet/wallet.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity'; // <-- FIXED IMPORT
import { SubscriptionRequest } from './entities/subscription-request.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SubscriptionRequest]),
    forwardRef(() => ProductsModule),
    WalletModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
