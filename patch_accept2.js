const fs = require('fs');
const filePath = 'src/deliverer/deliverer.service.ts';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
  'async acceptAssignment(delivererId: number, orderId: number) {',
  `async acceptAssignment(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['deliverer'],
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.deliverer && order.deliverer.id !== delivererId) {
      throw new ForbiddenException('Order is already assigned to someone else');
    }

    order.deliverer = { id: delivererId } as any;
    order.delivererId = delivererId as any;
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.ACCEPTED;
    if (order.status === OrderStatus.PENDING) {
      order.status = OrderStatus.PROCESSING;
    }

    await this.orderRepository.save(order);
    return { success: true };
  }

  // legacy override to hide it down below
  async dummyAccept(delivererId: number, orderId: number) {`,
);

// We need to properly replace the reject function too as it was buggy.

code = code.replace(
  'async rejectAssignment(delivererId: number, orderId: number) {',
  `async rejectAssignment(delivererId: number, orderId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'deliverer',
        'items',
        'items.product',
        'items.product.vendor',
      ],
    });

    if (!order) throw new NotFoundException('Order not found');
    
    // If it's literally unassigned, allow them to hide it locally by just returning success
    if (!order.deliverer || !order.delivererId) {
       return { success: true, message: 'Unassigned order rejected locally.' };
    }
    
    // Otherwise, if assigned to someone else
    if (order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You cannot reject someone else\\'s assigned order');
    }

    const delivererName = order.deliverer.displayName || 'A deliverer';

    // Reset assignment
    order.deliverer = undefined; 
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.REJECTED;
    order.status = OrderStatus.PROCESSING; 
    
    // Use query builder to nullify delivererId to be safe with FKs
    await this.orderRepository
      .createQueryBuilder()
      .update(Order)
      .set({
        deliverer: null,
        delivererId: null as any,
        deliveryAcceptanceStatus: DeliveryAcceptanceStatus.REJECTED,
        status: OrderStatus.PROCESSING,
      })
      .where('id = :id', { id: orderId })
      .execute();
      
    // Emit a NotificationService fan-out push back to the Vendor(s).
    const vendorIds = new Set<number>();
    if (order.items) {
      for (const item of order.items) {
        if (item.product && item.product.vendor) {
          vendorIds.add(item.product.vendor.id);
        }
      }
    }

    for (const vendorId of vendorIds) {
      await this.notificationsService.createAndDispatch({
        type: NotificationType.ORDER,
        userId: vendorId,
        title: 'Deliverer Declined Order',
        body: \`\${delivererName} declined order #\${order.id}. Please reassign a deliverer.\`,
        data: {
          orderId: order.id.toString(),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      });
    }

    return { success: true };
  }

  async dummyReject(delivererId: number, orderId: number) {`,
);

fs.writeFileSync(filePath, code);
