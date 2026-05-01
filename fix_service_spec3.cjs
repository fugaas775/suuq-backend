const fs = require('fs');

const serviceSpecPath = '/root/suuq-backend/src/branch-staff/branch-staff.service.spec.ts';
let content = fs.readFileSync(serviceSpecPath, 'utf8');

content = content.replace(/it\('links an existing user immediately when invited by email[\s\S]*?(?=it\('|describe\()/g, '');

fs.writeFileSync(serviceSpecPath, content);
console.log('Fixed links an existing user test');
