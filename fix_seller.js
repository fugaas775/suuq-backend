const fs = require('fs');
let file = './src/seller-workspace/seller-workspace.service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /        if \(\!tenant\.onboardingProfile\?\.categoryId\) \{\s*blockers\.push\('Choose a primary retail category\.'\);\s*\}/g,
  '',
);
code = code.replace(
  /        if \(\!tenant\.onboardingProfile\?\.userFit\) \{\s*blockers\.push\('Choose a POS fit category\.'\);\s*\}/g,
  '',
);

fs.writeFileSync(file, code);
