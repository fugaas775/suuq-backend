import { IsEnum } from 'class-validator';
import { OrderStatus } from '../../orders/entities/order.entity';

export class UpdateOrderItemStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
