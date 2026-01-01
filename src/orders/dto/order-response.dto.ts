import { Expose, Type } from 'class-transformer';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../entities/order.entity';

export class OrderItemResponseDto {
  @Expose() productId: number;
  @Expose() productName?: string;
  @Expose() productImageUrl?: string | null;
  @Expose() quantity: number;
  @Expose() price: number;
  @Expose() price_display?: {
    amount: number | null;
    currency: string;
    convertedFrom?: string;
    rate?: number;
  };
}

export class OrderResponseDto {
  @Expose() id: number;
  @Expose() total: number;
  @Expose() status: OrderStatus;
  @Expose() paymentMethod: PaymentMethod;
  @Expose() paymentStatus: PaymentStatus;
  @Expose() createdAt: Date;
  @Expose() shippingAddress: any;
  @Expose() currency?: string;
  @Expose() total_display?: {
    amount: number;
    currency: string;
    convertedFrom?: string;
    rate?: number;
  };
  @Expose() delivererId?: number;
  @Expose() delivererName?: string;
  @Expose() delivererEmail?: string;
  @Expose() delivererPhone?: string;
  @Expose() userId: number;
  // For admin tables: vendors involved in this order
  @Expose() vendors?: Array<{
    id: number;
    displayName?: string | null;
    storeName?: string | null;
  }>;
  // Convenience for single-vendor orders
  @Expose() vendorName?: string | null;
  @Expose() @Type(() => OrderItemResponseDto) items: OrderItemResponseDto[];
}
