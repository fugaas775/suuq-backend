const fs = require('fs');
const filePath = 'src/deliverer/deliverer.service.ts';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
  "if (!order.deliverer || order.deliverer.id !== delivererId) {\n      throw new ForbiddenException('You are not assigned to this order');\n    }",
  `// Deliverers should be able to reject an unassigned (claimable) order to hide/remove it
    // Or if assigned, they reject it.
    if (order.deliverer && order.deliverer.id !== delivererId) {
      throw new ForbiddenException('You cannot reject someone else\\'s assigned order');
    }
    
    if (!order.deliverer) {
      // It's not assigned to anyone yet. Returning success could be valid to clear it for them locally in flutter.
      return { success: true, message: 'Unassigned order rejected locally.' };
    }`,
);

fs.writeFileSync(filePath, code);
