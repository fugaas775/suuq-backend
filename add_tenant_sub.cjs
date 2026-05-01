const fs = require('fs');
const filepath = '/root/suuq-backend/src/branch-staff/branch-staff.service.spec.ts';
let content = fs.readFileSync(filepath, 'utf8');

const injection = `
        {
          provide: getRepositoryToken(TenantSubscription),
          useValue: tenantSubscriptionsRepository,
        },
`;

if (!content.includes('getRepositoryToken(TenantSubscription)')) {
  // It probably was removed by mistake or missing before.
  content = content.replace(/\{ provide: EmailService/, injection + '        { provide: EmailService');

  // Need to define tenantSubscriptionsRepository mock and import TenantSubscription if it's missing.
  if(!content.includes('tenantSubscriptionsRepository')) {
    content = content.replace(/const retailTenantsRepository = \{[\s\S]*?\};/, `$&
  const tenantSubscriptionsRepository = { findOne: jest.fn(), find: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() };`);
  }
  
  if(!content.includes('TenantSubscription')) {
    content = content.replace(/import\s*\{\s*RetailTenant\s*\}\s*from\s*'.*?';/, `$&
import { TenantSubscription } from '../retail/entities/tenant-subscription.entity';`);
  }
}

fs.writeFileSync(filepath, content);
console.log('Added TenantSubscription to branch-staff.service.spec.ts');
