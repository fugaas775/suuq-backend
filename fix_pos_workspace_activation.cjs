const fs = require('fs');
const file = 'src/branch-staff/pos-workspace-activation.service.spec.ts';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('getRepositoryToken(Branch)')) {
  content = content.replace(
    'BranchStaffService, useValue: branchStaffService },',
    'BranchStaffService, useValue: branchStaffService },\n        { provide: getRepositoryToken(Branch), useValue: {} },\n        { provide: getRepositoryToken(BranchStaffAssignment), useValue: {} },\n        { provide: EquityPartnerService, useValue: {} },\n        { provide: EmailService, useValue: {} },'
  );
  if (!content.includes('import { Branch }')) {
    content = content.replace(
      'import { EbirrService } from \'../ebirr/ebirr.service\';',
      'import { EbirrService } from \'../ebirr/ebirr.service\';\nimport { Branch } from \'../branches/entities/branch.entity\';\nimport { BranchStaffAssignment } from \'./entities/branch-staff-assignment.entity\';\nimport { EquityPartnerService } from \'../retail/equity-partner.service\';\nimport { EmailService } from \'../email/email.service\';\nimport { getRepositoryToken } from \'@nestjs/typeorm\';'
    );
  }
}
fs.writeFileSync(file, content);
console.log('Fixed pos-workspace-activation.service.spec.ts');
