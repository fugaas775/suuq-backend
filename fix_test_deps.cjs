const fs = require('fs');

function injectProvider(filePath, className, importedModule, injectionTokenCode, useValueStr = '{}') {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`provide: ${injectionTokenCode}`)) return;

  // Add import
  if (!content.includes(importedModule)) {
    const importMatch = content.match(/^import .*$/m);
    if (importMatch) {
       content = content.replace(/^import .*$/m, `import { ${importedModule} } from '${getImportPath(filePath, importedModule)}';\n$&`);
    }
  }

  // Add provider to TestingModule
  const providerRegex = new RegExp(`(providers:\\s*\\[[\\s\\S]*?${className}[\\s\\S]*?)(,)`, 'm');
  content = content.replace(providerRegex, `$1,\n        { provide: ${injectionTokenCode}, useValue: ${useValueStr} }$2`);
  fs.writeFileSync(filePath, content);
  console.log(`Injected ${injectionTokenCode} into ${filePath}`);
}

function getImportPath(filePath, importedModule) {
    if (importedModule === 'EmailService') return '../email/email.service';
    if (importedModule === 'InventoryLedgerService') return '../branches/inventory-ledger.service';
    if (importedModule === 'ProductAliasesService') return '../seller-workspace/product-aliases.service';
    if (importedModule === 'BranchStaffService') return '../branch-staff/branch-staff.service';
    if (importedModule === 'PosPortalOnboardingService') return '../branch-staff/pos-portal-onboarding.service';
    return './mock'; // fallback
}

// manual custom fix for PosCheckoutService
let pcSpecPath = 'src/pos-sync/pos-checkout.service.spec.ts';
if (fs.existsSync(pcSpecPath)) {
  let c = fs.readFileSync(pcSpecPath, 'utf8');
  if(!c.includes('provide: EmailService')) {
      c = c.replace('useValue: productAliasesServiceMock,', 'useValue: productAliasesServiceMock,\n        },\n        { provide: EmailService, useValue: {}');
      c = c.replace('import { ProductAliasesService }', "import { EmailService } from '../email/email.service';\nimport { ProductAliasesService }");
      fs.writeFileSync(pcSpecPath, c);
      console.log('Fixed', pcSpecPath);
  }
}

