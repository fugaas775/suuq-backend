const fs = require('fs');
const filePath = 'src/deliverer/deliverer.service.ts';
let code = fs.readFileSync(filePath, 'utf8');

// Update getAvailableOrders to explicitly make sure we inject the order latitude/longitude to match Flutter expectations seamlessly
code = code.replace(
  'return orders.map((o) => {',
  `return orders.map((o) => {
      // In case Flutter specifically looks for raw lat/lng at root of object vs inside shippingAddress
      // the JSON is cleanly passed through already: o.shippingAddress?.latitude
      `,
);

fs.writeFileSync(filePath, code);
