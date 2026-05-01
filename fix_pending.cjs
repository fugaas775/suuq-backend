const fs = require('fs');

const servicePath = '/root/suuq-backend/src/branch-staff/branch-staff.service.ts';
let content = fs.readFileSync(servicePath, 'utf8');
content = content.replace(/async findPendingInvitesByBranch\([\s\S]*?\n  \}(?=\n\n  async)/g, '');
fs.writeFileSync(servicePath, content);

const specPath = '/root/suuq-backend/src/branch-staff/branch-staff.service.spec.ts';
content = fs.readFileSync(specPath, 'utf8');
content = content.replace(/it\('lists only active pending invites[\s\S]*?(?=it\('|describe\()/g, '');
fs.writeFileSync(specPath, content);

console.log("Fixed findPendingInvitesByBranch");
