const fs = require('fs');
const file = 'src/branch-staff/pos-portal-onboarding.service.spec.ts';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { User }')) {
  content = content.replace(
    'import { Branch } from \'../branches/entities/branch.entity\';',
    'import { Branch } from \'../branches/entities/branch.entity\';\nimport { User } from \'../users/entities/user.entity\';\nimport { SellerWorkspace } from \'../seller-workspace/entities/seller-workspace.entity\';'
  );
}

content = content.replace(
  '{ provide: BranchStaffService, useValue: branchStaffService },',
  '{ provide: BranchStaffService, useValue: branchStaffService },\n        { provide: getRepositoryToken(User), useValue: {} },\n        { provide: getRepositoryToken(SellerWorkspace), useValue: {} },'
);

fs.writeFileSync(file, content);
console.log('Fixed pos-portal-onboarding.service.spec.ts');
