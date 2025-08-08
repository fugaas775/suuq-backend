import { Expose, Type } from 'class-transformer';
import { OrderStatus, PaymentMethod, PaymentStatus } from '../entities/order.entity';

export class OrderItemResponseDto {
  @Expose() productId: number;
  @Expose() quantity: number;
  @Expose() price: number;
}

export class OrderResponseDto {
  @Expose() id: number;
  @Expose() total: number;
  @Expose() status: OrderStatus;
  @Expose() paymentMethod: PaymentMethod;
  @Expose() paymentStatus: PaymentStatus;
  @Expose() createdAt: Date;
  @Expose() shippingAddress: string;
  @Expose() delivererId?: number;
  @Expose() userId: number;
  @Expose() @Type(() => OrderItemResponseDto) items: OrderItemResponseDto[];
}
