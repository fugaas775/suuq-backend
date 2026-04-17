const fs = require('fs');

let file = './src/retail/retail-entitlements.service.ts';
let code = fs.readFileSync(file, 'utf8');

// remove everything I appended to the end of the file past the class close bracket
const lastBraceIndex = code.lastIndexOf('}');
let insideClass = code.substring(0, lastBraceIndex);
insideClass = insideClass.replace(/async updateTenantOwner[^]*/g, '');

const newMethod = `
  async updateTenantOwner(
    tenantId: number,
    dto: import('./dto/update-retail-tenant-owner.dto').UpdateRetailTenantOwnerDto,
    auditUser?: { id: number | null; email: string | null }
  ): Promise<any> {
    const tenant = await this.findTenantOrThrow(tenantId);
    return this.decorateTenantWithPosWorkspaceAudit(tenant);
  }
`;

fs.writeFileSync(file, insideClass + newMethod + '}\n');
