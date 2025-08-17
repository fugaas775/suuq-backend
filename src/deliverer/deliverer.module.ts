import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelivererService } from './deliverer.service';
import { DelivererController } from './deliverer.controller';
import { Order } from '../orders/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [DelivererController],
  providers: [DelivererService],
  exports: [DelivererService],
})
export class DelivererModule {}
