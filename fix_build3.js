const fs = require('fs');
let file = './src/retail/retail-entitlements.service.ts';
let code = fs.readFileSync(file, 'utf8');

// The class actually ends around where `return normalizedOvertimeHours; } }` is.
const correctMatch = code.match(/return normalizedOvertimeHours;\s*\}\s*\}/);
if (correctMatch) {
  const endIndex = correctMatch.index + correctMatch[0].length;
  // Keep everything up to the end of normalizeHrAttendanceOvertimeHours, excluding the last }
  code = code.substring(0, correctMatch.index + correctMatch[0].length - 1);

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

  fs.writeFileSync(file, code + newMethod + '}\n');
}
