const fs = require('fs');
const filePath = 'src/deliverer/deliverer.service.ts';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(
  'order.delivererId = delivererId as any;',
  '// removed invalid delivererId assignment',
);

code = code.replace(
  'if (!order.deliverer || !order.delivererId) {',
  'if (!order.deliverer) {',
);

code = code.replace(
  'delivererId: null as any,',
  '// removed invalid delivererId from set',
);

fs.writeFileSync(filePath, code);
