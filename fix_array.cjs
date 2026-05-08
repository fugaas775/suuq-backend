const fs = require('fs');
const file = 'src/branch-staff/pos-portal-onboarding.service.spec.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "allowedSelfServeServiceFormats: ['RETAIL', 'HOTEL'],",
  "allowedSelfServeServiceFormats: ['RETAIL'],"
);

fs.writeFileSync(file, content);
