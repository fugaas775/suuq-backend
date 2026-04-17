const fs = require('fs');
let file = './src/retail/retail-entitlements.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /    if \(\!tenant\.onboardingProfile\?\.categoryId\) \{\s*blockers\.push\('Choose a primary retail category\.'\);\s*\}/g,
  '',
);
code = code.replace(
  /    if \(\!tenant\.onboardingProfile\?\.userFit\) \{\s*blockers\.push\('Choose a POS fit category\.'\);\s*\}/g,
  '',
);

fs.writeFileSync(file, code);

let sysFile = './src/seller-workspace/seller-workspace.service.ts';
let sysCode = fs.readFileSync(sysFile, 'utf8');

sysCode = sysCode.replace(
  /          if \(\!tenant\.onboardingProfile\?\.categoryId\) \{\s*blockers\.push\('Choose a primary retail category\.'\);\s*\}/g,
  '',
);
sysCode = sysCode.replace(
  /          if \(\!tenant\.onboardingProfile\?\.userFit\) \{\s*blockers\.push\('Choose a POS fit category\.'\);\s*\}/g,
  '',
);

fs.writeFileSync(sysFile, sysCode);
