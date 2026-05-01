const fs = require('fs');
const filepath = '/root/suuq-backend/src/branch-staff/branch-staff.service.spec.ts';
let content = fs.readFileSync(filepath, 'utf8');

if (!content.includes("let tenantSubscriptionsRepository;")) {
  content = content.replace(/let retailTenantsRepository;/, `let retailTenantsRepository;\n  let tenantSubscriptionsRepository;`);
  content = content.replace(/retailTenantsRepository = \{[\s\S]*?\};/, `$&
    tenantSubscriptionsRepository = { findOne: jest.fn(), find: jest.fn() };`);
  fs.writeFileSync(filepath, content);
  console.log("Fixed let and init");
}
