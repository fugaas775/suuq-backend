const fs = require('fs');
const path = require('path');

function processFile(file) {
  const fullPath = path.join('/root/suuq-backend', file);
  let content = fs.readFileSync(fullPath, 'utf8');

  // Skip if already has PosPortalOnboardingService
  if (content.includes('provide: PosPortalOnboardingService')) return;

  const imports = `import { PosPortalOnboardingService } from '../branch-staff/pos-portal-onboarding.service';\nimport { SellerWorkspace } from '../seller-workspace/entities/seller-workspace.entity';\nimport { InventoryLedgerService } from '../branches/inventory-ledger.service';`;

  if (!content.includes('import { PosPortalOnboardingService }')) {
    content = content.replace(
      /^import.*$/m,
      `${imports}\n$&`
    );
  }

  const providersToAdd = `
        { provide: InventoryLedgerService, useValue: {} },
        { provide: PosPortalOnboardingService, useValue: {} },
        { provide: getRepositoryToken(SellerWorkspace), useValue: {} },`;

  // Find where VendorService is provided and inject there
  content = content.replace(
    /VendorService,/g,
    `VendorService,${providersToAdd}`
  );

  fs.writeFileSync(fullPath, content);
  console.log('Fixed', file);
}

['src/vendor/vendor.service.spec.ts', 'src/vendor/vendor-private-note.access.spec.ts', 'src/vendor/vendor.controller.spec.ts', 'src/vendor/vendor-deliverers.geo.spec.ts'].forEach(processFile);
