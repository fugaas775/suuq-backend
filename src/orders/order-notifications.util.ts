import { OrderStatus } from './entities/order.entity';

export type OrderStatusNotificationPayload = {
  title: string;
  body: string;
  data: Record<string, string>;
};

export function buildOrderStatusNotification(
  orderId: number,
  status: OrderStatus,
): OrderStatusNotificationPayload {
  const id = Number(orderId);
  const idStr = Number.isFinite(id) ? String(id) : String(orderId);

  const baseData = {
    id: idStr,
    status,
    route: `/order-detail?id=${idStr}`,
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
  } as const;

  switch (status) {
    case OrderStatus.PROCESSING:
      return {
        title: 'Order Update',
        body: `Order #${idStr} is being prepared.`,
        data: { ...baseData },
      };
    case OrderStatus.SHIPPED:
      return {
        title: 'Order Update',
        body: `Your order #${idStr} has been shipped!`,
        data: { ...baseData },
      };
    case OrderStatus.OUT_FOR_DELIVERY:
      return {
        title: 'Order Update',
        body: `Order #${idStr} is out for delivery.`,
        data: { ...baseData },
      };
    case OrderStatus.DELIVERED:
      return {
        title: 'Delivered',
        body: `Order #${idStr} was delivered.`,
        data: { ...baseData },
      };
    case OrderStatus.DELIVERY_FAILED:
      return {
        title: 'Delivery Issue',
        body: `We could not deliver order #${idStr}. Tap to review options.`,
        data: { ...baseData },
      };
    case OrderStatus.CANCELLED:
      return {
        title: 'Order Cancelled',
        body: `Order #${idStr} has been cancelled.`,
        data: { ...baseData },
      };
    default:
      return {
        title: 'Order Update',
        body: `Order #${idStr} has been updated.`,
        data: { ...baseData },
      };
  }
}
