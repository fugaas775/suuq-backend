const fs = require('fs');
const filePath = 'src/deliverer/deliverer.service.ts';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
  "if (order.deliverer && order.deliverer.id !== delivererId) {\n      throw new ForbiddenException('Order is already assigned to someone else');\n    }\n\n    order.deliverer = { id: delivererId } as any;\n    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.ACCEPTED;\n    if (order.status === OrderStatus.PENDING) {\n      order.status = OrderStatus.PROCESSING;\n    }\n\n    await this.orderRepository.save(order);",
  `if (order.deliverer && order.deliverer.id !== delivererId) {
      throw new ForbiddenException('Order is already assigned to someone else');
    }

    order.deliverer = { id: delivererId } as any;
    order.delivererId = delivererId; // Make sure the direct column gets it too just in case
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.ACCEPTED;
    
    // Auto pickup standard logic
    if (order.status === 'PENDING' || order.status === 'PROCESSING') {
       // if we want to auto-bump to shipped when claimed:
       // we can leave it processing or whatever the flow desires
    }

    await this.orderRepository.save(order);`,
);

fs.writeFileSync(filePath, code);
