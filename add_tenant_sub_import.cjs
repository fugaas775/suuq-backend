const fs = require('fs');
const filepath = '/root/suuq-backend/src/branch-staff/branch-staff.service.spec.ts';
let content = fs.readFileSync(filepath, 'utf8');

if (!content.includes("from '../retail/entities/tenant-subscription.entity'")) {
  content = "import { TenantSubscription } from '../retail/entities/tenant-subscription.entity';\n" + content;
  fs.writeFileSync(filepath, content);
}

