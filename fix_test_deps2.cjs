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
  const providerRegex = new RegExp(`(\\b${className}\\b[\\s\\S]*?)(,)`, 'm');
  content = content.replace(providerRegex, `$1,\n        { provide: ${injectionTokenCode}, useValue: ${useValueStr} }$2`);
  fs.writeFileSync(filePath, content);
  console.log(`Injected ${injectionTokenCode} into ${filePath}`);
}

function getImportPath(filePath, importedModule) {
    if (importedModule === 'EmailService') return '../email/email.service';
    if (importedModule === 'InventoryLedgerService') return '../branches/inventory-ledger.service';
    if (importedModule === 'ProductAliasesService') return '../product-aliases/product-aliases.service';
    if (importedModule === 'BranchStaffService') return '../branch-staff/branch-staff.service';
    if (importedModule === 'PosPortalOnboardingService') {
        if(filePath.includes('admin/b2b.admin.service.spec.ts')) return '../branch-staff/pos-portal-onboarding.service';
        return '../branch-staff/pos-portal-onboarding.service';
    }
    if (importedModule === 'PosCheckoutService') return '../pos-sync/pos-checkout.service';
    if (importedModule === 'AuditService') return '../audit/audit.service';
    if (importedModule === 'Branch') return '../branches/entities/branch.entity';
    
    // Auth fallback
    if (importedModule === 'BranchStaffAssignment') return '../branch-staff/entities/branch-staff-assignment.entity';
    if (importedModule === 'VendorStaff') return '../vendor/entities/vendor-staff.entity';

    return './mock'; // fallback
}

// 1. src/purchase-orders/purchase-orders.service.spec.ts -> missing PosCheckoutService
// actually let's just see test output for others
