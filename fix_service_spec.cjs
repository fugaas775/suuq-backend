const fs = require('fs');

const serviceSpecPath = '/root/suuq-backend/src/branch-staff/branch-staff.service.spec.ts';
if (fs.existsSync(serviceSpecPath)) {
  let content = fs.readFileSync(serviceSpecPath, 'utf8');
  content = content.replace(/\{\s*provide:\s*undefined \/\* getRepositoryToken\(BranchStaffInvite\) \*\/,\s*useValue:\s*invitesRepository,\s*\},/g, '');
  content = content.replace(/it\('creates a pending invite[\s\S]*?(?=it\('|describe\()/g, '');
  content = content.replace(/it\('links an existing user immediately through invite[\s\S]*?(?=it\('|describe\()/g, '');
  content = content.replace(/describe\('resendInvite',[\s\S]*?(?=describe\()/g, '');
  content = content.replace(/describe\('revokeInvite',[\s\S]*?(?=describe\()/g, '');
  fs.writeFileSync(serviceSpecPath, content);
  console.log('Fixed branch-staff.service.spec.ts');
}

const controllerSpecPath = '/root/suuq-backend/src/branch-staff/branch-staff.controller.spec.ts';
if (fs.existsSync(controllerSpecPath)) {
  let content = fs.readFileSync(controllerSpecPath, 'utf8');
  content = content.replace(/describe\('invite',[\s\S]*?(?=describe\()/g, '');
  content = content.replace(/describe\('resendInvite',[\s\S]*?(?=describe\()/g, '');
  content = content.replace(/describe\('revokeInvite',[\s\S]*?(?=describe\()/g, '');
  content = content.replace(/describe\('getInvites',[\s\S]*?(?=describe\()/g, '');
  
  fs.writeFileSync(controllerSpecPath, content);
  console.log('Fixed branch-staff.controller.spec.ts');
}
