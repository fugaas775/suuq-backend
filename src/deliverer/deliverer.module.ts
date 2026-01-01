import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelivererService } from './deliverer.service';
import { DelivererController } from './deliverer.controller';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { WalletModule } from '../wallet/wallet.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Product]),
    WalletModule,
    SettingsModule,
  ],
  controllers: [DelivererController],
  providers: [DelivererService],
  exports: [DelivererService],
})
export class DelivererModule {}
